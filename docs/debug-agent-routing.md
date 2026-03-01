# 에이전트 라우팅 디버그 — 발견 사항 & 수정 계획

> 브랜치: `claude/debug-agent-routing-5RAgz`
> 기준 버전: v0.8.12 (17b689f)
> 작성일: 2026-03-01

---

## 1. 발견된 버그

### B1. ANALYZING → PLANNING 자동 전환 누락 (Critical)

**위치**: `hooks/post-pipeline-state.mjs:17-33`

`PHASE_ARTIFACTS` 맵에 ANALYZING 항목이 없어서,
ANALYZING phase에서 `analysis.md`가 생성되어도 자동 전환이 일어나지 않는다.

```js
// 현재 — ANALYZING 누락
const PHASE_ARTIFACTS = {
  [STATES.PLANNING]: { artifact: "design.md", next: STATES.EXECUTING },
  [STATES.EXECUTING]: { artifact: "implementation.md", next: STATES.REVIEWING },
  [STATES.REVIEWING]: { artifact: "review.md", next: STATES.AWAITING_APPROVAL },
};
// ❌ ANALYZING → analysis.md → PLANNING 없음
```

**영향**: 분석 완료 후 파이프라인이 멈추고, Leader가 수동으로 state-cli.mjs를 호출해야 진행됨.
팀 프리셋의 첫 번째 단계가 ANALYZING이므로 **모든 팀에서 발생**.

**수정**:
```js
const PHASE_ARTIFACTS = {
  [STATES.ANALYZING]: {
    artifact: join(cwd, FINDINGS_DIR, "analysis.md"),
    next: STATES.PLANNING,
    label: "Analysis complete",
  },
  // ... 기존 항목들
};
```

---

### B2. ALLOWED_TOOLS에 'Agent' 누락 (Medium)

**위치**: `lib/constants.mjs:25-29`

```js
export const ALLOWED_TOOLS = new Set([
  "Task", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet",
  "TeamCreate", "TeamDelete", "SendMessage", "AskUserQuestion",
  "Skill", "TaskOutput", "TaskStop",
]);
// ❌ "Agent" 없음 — "Task" 잔재
```

현재는 `pre-tool-enforce.mjs`에서 Leader architecture일 때 enforcement를 skip하므로
실동작에는 영향이 적지만, non-leader 모드(향후 확장)에서 Agent 호출이 차단될 수 있다.

**수정**: `"Agent"`를 ALLOWED_TOOLS에 추가. `"Task"` 잔재 제거.

---

### B3. gemini_exec.sh에 `set -euo pipefail` 누락 (Low)

**위치**: `scripts/gemini_exec.sh:11`

```bash
set -e    # ❌ CLAUDE.md 규칙: set -euo pipefail 필수
```

`codex_exec.sh`는 `set -euo pipefail`을 사용하지만 `gemini_exec.sh`는 `set -e`만 사용.
미정의 변수 참조 시 silent fail 가능.

**수정**: `set -e` → `set -euo pipefail`

---

### B4. Spawn phase에서 Read/Glob/Grep 차단 (High)

**위치**: `hooks/pre-tool-enforce.mjs:70-84`

```js
const SPAWN_ALLOWED = new Set(["Agent", "TeamCreate", "AskUserQuestion"]);
// ❌ Read, Glob, Grep 없음
```

전원 스폰이 완료될 때까지 Host가 `Read`, `Glob`, `Grep`도 사용 불가.
auto-delegate.mjs의 Step 1이 `Glob('teams/*.md')`인데,
TeamCreate 후 바로 팀 프리셋을 Glob/Read해야 하는 순간에 차단될 수 있다.

실제 흐름:
1. auto-delegate → Glob(teams/*.md) — 아직 세션 없으므로 통과
2. Read(teams/bugfix.md) — 아직 세션 없으므로 통과
3. TeamCreate → session.json 생성 (phase=IDLE, spawned=false)
4. Agent(leader-agent) → post-tool-verify → leader spawned=true
5. **Read(session.json) — 세션 있고 미스폰 멤버 있으므로 차단!** ← 문제

auto-delegate 지시문에서 Host에게 Glob/Read를 쓰지 말라고 하지만,
LLM이 상태 확인을 위해 Read를 시도할 수 있고 그때 차단됨.

**수정**: `SPAWN_ALLOWED`에 `Read`, `Glob`, `Grep` 추가.
이 세 도구는 읽기 전용이므로 파이프라인 무결성에 영향 없음.

---

### B5. post-pipeline-state.mjs 중복 전환 시도 (Low)

**위치**: `hooks/post-pipeline-state.mjs` (전체)

이 훅은 `PostToolUse` empty matcher에 걸려 **모든 도구 호출 후** 실행된다.
이미 전환이 완료된 후에도 같은 artifact를 감지하여 재전환 시도 →
state-machine이 "Invalid transition" 에러 반환.
무해하지만 불필요한 에러 로그가 쌓인다.

**수정**: 전환 전에 `session.phase`를 다시 읽어서 이미 전환됐는지 확인.

```js
// 전환 전 최신 세션 재로드 (다른 훅이 이미 전환했을 수 있음)
const freshSession = readSession();
if (!freshSession || freshSession.phase !== session.phase) {
  process.exit(0); // 이미 전환됨
}
```

---

### B6. post-tool-verify.mjs 출력 형식 불일치 (Medium)

**위치**: `hooks/post-tool-verify.mjs:120-126`

```js
const result = {
  continue: true,
  systemMessage: messages.join("\n"),  // ❌ PostToolUse 훅 출력 형식?
};
```

`auto-delegate.mjs`(UserPromptSubmit)에서는 `hookSpecificOutput.additionalContext`를 사용하는데,
`post-tool-verify.mjs`(PostToolUse)에서는 `systemMessage`를 사용.
PostToolUse 훅의 공식 출력 형식이 `systemMessage`인지 확인 필요.

v0.8.9에서 auto-delegate의 출력 형식을 `systemMessage` → `hookSpecificOutput.additionalContext`로 수정한 전례가 있으므로, PostToolUse 훅도 동일한 이슈가 있을 수 있음.

**수정**: Claude Code 훅 문서 확인 후 올바른 출력 형식으로 통일.

---

## 2. 외부 모델 최적화 (B 방식)

현재 구조를 유지하되 (Claude proxy), 비용을 최소화한다.

### 현재 구조

```
Host → Agent(subagent_type='ai-party:gemini-agent', model='sonnet')
     → Claude sonnet 스폰 (프록시 비용 발생)
     → Claude가 Bash(gemini_exec.sh ...) 호출
     → Gemini CLI 실행 → 결과 반환
     → Claude가 결과 해석 + findings 작성
```

### 최적화 방향

| 항목 | 현재 | 개선 |
|------|------|------|
| **모델 등급** | sonnet | haiku (프록시에 opus 불필요) |
| **max_turns** | 없음 (무제한) | 5~10 (CLI 호출 + findings 작성이면 충분) |
| **프롬프트 크기** | agents/*.md 전문 | 역할별 최소 프롬프트 |
| **도구 제한** | Bash, Read, Grep, Glob, TodoWrite | Bash, Read만 (최소한) |

### 구현 계획

1. `AGENT_MODEL_MAP` 변경: gemini-agent/codex-agent → `haiku`
2. agents/*.md의 중복/장황한 설명 축소
3. auto-delegate.mjs의 스폰 지시에 max_turns 추가
4. gemini-agent.md/codex-agent.md tools 축소: Bash + Read만

### 장기 방향 (이 브랜치 범위 밖)

- 단순 분석(파일 스캔, 로그 파싱)은 훅에서 직접 CLI 호출 (Claude 프록시 제거)
- 복잡한 멀티스텝 작업만 Claude 프록시 유지
- 작업 복잡도에 따른 분기 (teams/*.md에 complexity 태그)

---

## 3. 수정 우선순위

```
[P0 — 파이프라인 동작에 영향]
  B1. ANALYZING 자동 전환 누락
  B4. Spawn phase Read 차단

[P1 — 정합성/안정성]
  B2. ALLOWED_TOOLS 'Agent' 누락
  B6. PostToolUse 출력 형식 확인
  B5. 중복 전환 방지

[P2 — 코드 품질]
  B3. gemini_exec.sh set 옵션

[P3 — 외부 모델 최적화]
  AGENT_MODEL_MAP haiku 전환
  에이전트 프롬프트 축소
  max_turns 제한
```

---

## 4. 영향받는 파일 목록

```
hooks/post-pipeline-state.mjs    — B1, B5
hooks/pre-tool-enforce.mjs       — B4
hooks/post-tool-verify.mjs       — B6
lib/constants.mjs                — B2, 모델 맵 변경
scripts/gemini_exec.sh           — B3
agents/gemini-agent.md           — 프롬프트 축소
agents/codex-agent.md            — 프롬프트 축소
docs/phase3.md                   — 버전 이력 갱신
```

---

## 5. MAS(Claude-Multi-Agent-System) 비교 분석 요약

외부 레퍼런스로 [Kuneosu/Claude-Multi-Agent-System](https://github.com/Kuneosu/Claude-Multi-Agent-System)을 분석함.

### 아키텍처 비교

| | MAS | ai-party |
|---|---|---|
| **런타임** | 9개 독립 tmux 세션 (각 Claude CLI) | Agent Teams API 서브에이전트 |
| **통신** | tmux send-keys + signal 파일 폴링 | SendMessage + .party/findings/ |
| **조율** | Orchestrator (Claude opus LLM) | Leader (Claude opus) + 훅 자동화 |
| **파이프라인** | 고정 8단계 워터폴 | 상태 머신 (유연) |
| **병렬** | 불가 (순차만) | 팀 프리셋 정의 가능 |
| **외부 모델** | Claude만 | Gemini CLI + Codex CLI |
| **강제력** | 프롬프트 의존 | 3계층 기계적 강제 |
| **비용** | 9 opus 동시 (~86K tokens/project) | Leader opus + Worker haiku |

### MAS에서 배울 것

1. **Bash 루프 폴링 = 토큰 0**: signal 파일 대기 시 Claude API 토큰 미소모
2. **Phase Cleanup**: 분석 에이전트 종료 후 구현 에이전트만 실행 → 리소스 절약
3. **에이전트별 독립 CLAUDE.md에 IPC 프로토콜 명시**: 준수율 향상

### MAS에서 피할 것

1. tmux send-keys (키 입력 주입) → 타이밍 이슈, 예상치 못한 프롬프트에 취약
2. Orchestrator가 LLM → 조율 비용 폭탄 (우리는 훅 자동화로 절감)
3. 고정 워터폴 → 유연성 없음 (우리는 팀 프리셋으로 구성 가능)
4. 병렬 불가 → 문서상 가능하다고 했지만 미구현
