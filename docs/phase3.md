# Phase 3: 실행 엔진 신뢰성 확보

> 핵심: "시키면 반드시 동작하는" 파이프라인.
> 요청 단위로 팀이 꾸려지고, 상태 머신으로 단계를 강제하며, 훅으로 기계적 제약을 건다.
> OMC(oh-my-claudecode) 패턴 채택. `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 필수.
> 관련: [index.md](index.md) | 이전 ← [phase1-2.md](phase1-2.md) | 다음 → [phase4-6.md](phase4-6.md)

**현재 버전: v0.8.8**

---

## 구현 발견 사항 (Implementation Notes)

> Phase 3 구현 과정에서 발견된 사실들. 설계 문서와 실제 동작의 차이.

### Claude Code 도구 이름: "Agent" (not "Task")

설계 문서에서는 에이전트 스폰 도구를 "Task"로 기술했으나,
실제 Claude Code는 **"Agent"** 도구를 사용한다.

```
설계: PostToolUse(Task) → hooks 실행
실제: PostToolUse(Agent) → hooks 실행
```

hooks.json의 matcher와 훅 내부의 toolName 체크 모두 "Agent"로 수정 완료 (v0.8.6~v0.8.8).

### Leader Agent 도입

설계 문서에서는 Host가 직접 오케스트레이션을 수행하는 구조였으나,
Phase 3에서 **leader-agent.md**를 추가하여 오케스트레이션을 전담 에이전트에 위임.
Host는 승인 게이트만 담당하고, Leader가 워커 조율과 상태 전환을 수행.

### 세션 초기화: 훅 기반 결정론

설계: Host LLM이 session.json을 Write 도구로 생성
실제: **post-team-init.mjs** 훅이 TeamCreate 직후 결정론적으로 생성
  - teams/*.md에서 멤버 파싱
  - 시작 phase 자동 결정
  - pluginRoot 절대 경로 주입
  - 터미널 phase(COMPLETED/DONE/FAILED 등) 세션 재사용 방지 (v0.8.7)

### tickets.mjs — 훅용 보완 레이어 (미연동)

Agent Teams API(TaskCreate/TaskList)와 tickets.mjs는 **경쟁이 아니라 보완 관계**:
- **Agent Teams API**: LLM이 호출 (에이전트 스폰/관리, Claude Code 네이티브)
- **tickets.mjs**: 훅이 호출 (파일 기반 상태, Node.js에서 접근 가능)

훅은 Agent Teams API를 호출할 수 없으므로, 디자인 문서가 `.party/tickets/`를 별도로 둔 것.
현재 라이브러리만 존재하고 미러링 연동은 미구현. `arePhaseTicketsDone()`은 항상 true 반환.
→ **Phase 5 대시보드 연동 시 PostToolUse 미러링으로 활성화 예정.**

---

## 오케스트레이션 엔진

### 워크플로우 상태 머신

```
IDLE → ANALYZING → PLANNING → EXECUTING → REVIEWING → AWAITING_APPROVAL
  │                                                         │
  │                    ┌──────────────────────────────────────┘
  │                    │
  │               ┌────┴────┐
  │               │ 승인?    │
  │               └────┬────┘
  │                    │
  │          ┌─────────┼─────────┐
  │          ▼         ▼         ▼
  │      APPROVED   REJECTED   REVISION
  │          │         │         │
  │          ▼         ▼         │
  │       DONE    ROLLED_BACK    │
  │                              │
  └──────────────────────────────┘
```

구현: `lib/state-machine.mjs`
- TRANSITIONS 테이블로 허용 전환만 가능
- GUARDED_PHASES: artifact 존재 OR 티켓 완료 확인 후 전환
- fix loop: REVISION 3회 초과 시 FAILED
- 터미널 상태(DONE/ROLLED_BACK/FAILED): completed_at 타임스탬프

### 단계별 에이전트 활동

정보 전달은 **파일 기반 핸드오프** (`.party/findings/*.md`).
SendMessage는 단계 완료 시그널용.

```
ANALYZING   → findings/analysis.md         → PLANNING
PLANNING    → findings/design.md           → EXECUTING
EXECUTING   → findings/implementation.md   → REVIEWING
REVIEWING   → findings/review.md           → AWAITING_APPROVAL
```

### 자동 상태 전환

`post-pipeline-state.mjs` — PostToolUse(Agent) 훅:
- 현재 phase의 artifact 파일 존재 감지 → 자동으로 다음 phase 전환
- 수동 전환(APPROVED/REJECTED/REVISION)은 Leader가 state-cli.mjs 사용

### session.json 스키마

```json
{
  "id": "party-{team}-{timestamp}",
  "team": "bugfix",
  "task": "원본 요청",
  "phase": "ANALYZING",
  "phase_history": [{ "phase": "...", "entered_at": "...", "reason": "..." }],
  "execution": {
    "workers_total": 4,
    "workers_active": 0,
    "tasks_total": 0,
    "tasks_completed": 0
  },
  "fix_loop": { "attempt": 0, "max_attempts": 3 },
  "cancel": { "requested": false, "preserve_for_resume": false },
  "artifacts": {
    "analysis_path": null,
    "design_path": null,
    "implementation_path": null,
    "review_path": null
  },
  "members": [{ "name": "analyst", "agent": "gemini-agent", "role": "analyst", "spawned": false }],
  "pluginRoot": "/absolute/path/to/ai-party",
  "starting_phase": "ANALYZING",
  "created_at": "2026-02-28T04:30:00Z"
}
```

### events.ndjson 이벤트 스트림

Phase 5 대시보드의 데이터 소스.

```json
{
  "ts": "2026-02-28T04:30:00Z",
  "type": "phase_changed",
  "sessionId": "party-bugfix-...",
  "data": { "from": "IDLE", "to": "ANALYZING", "reason": "All members spawned" }
}
```

이벤트 타입: `pipeline_started`, `pipeline_completed`, `phase_changed`,
`ticket_created`, `ticket_updated`, `findings_submitted`,
`approval_requested`, `decision_made`, `agent_spawned`,
`agent_completed`, `team_spawn_verified`, `error_occurred`

---

## 통신 프로토콜

```
활성화 필수: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

통신 채널 2개:
  1. .party/findings/*.md — 정보 전달 (결과물, 분석, 설계)
  2. SendMessage — 시그널 ("분석 완료, 다음 단계 시작 가능")

태스크 관리:
  - TaskCreate(blockedBy) — 단계 의존성 강제
  - TaskUpdate(status) — 진행 상태 업데이트
  - TaskList — Lead/Leader가 모니터링
```

### 핸드오프 흐름

```
[analyst] → findings/analysis.md → SendMessage("분석 완료") → Leader 감지
                                                                ↓
[architect] ← Leader 지시 → findings/analysis.md 읽기 → findings/design.md 작성
                                                                ↓
[builder] ← Leader 지시 → findings/design.md 읽기 → 코드 수정 + findings/implementation.md
                                                                ↓
[reviewer] ← Leader 지시 → git diff + design.md 대조 → findings/review.md
                                                                ↓
[Leader] → findings/*.md 전부 수집 → Host에게 승인 요청 → 사용자에게 제시
```

---

## 승인 게이트

### 승인 필요 액션

| 액션 | 승인 레벨 |
|------|-----------|
| 코드 수정 | **필수** — git diff 요약 |
| PR 생성 | **필수** — PR 제목, 브랜치 |
| kubectl/helm 실행 | **필수** — 실행 + 롤백 명령 |
| 분석/설계 결과 | 자동 — 파이프라인 요약만 |

### 승인 처리

```
CLI 모드: 터미널에 요약 출력, approve / reject / revise 입력
알림 모드 (Phase 5): 카카오워크/슬랙 버튼
대시보드 모드 (Phase 5): 웹 UI 카드
```

---

## 3계층 강제 모델 (Enforcement Layers)

> 프롬프트만으로는 팀 스폰과 위임을 강제할 수 없다.
> 기계적 + 검증적 + 맥락적 강제를 조합.

### L3: PreToolUse 기계적 차단 (`pre-tool-enforce.mjs`)

- 파이프라인 활성 중 Host가 직접 Read/Edit/Write/Bash 호출 시 차단
- Agent 도구 호출은 허용 (에이전트 스폰)
- 승인 게이트 단계(AWAITING_APPROVAL)에서는 Host 직접 도구 허용
- OMC 패턴: systemMessage 설득이 아닌 기계적 차단

### L2: PostToolUse 검증 (`post-tool-verify.mjs`)

- 팀 스폰 완료 검증: members[].spawned 추적 → 전원 스폰 시 team_spawn_verified 이벤트
- 전원 스폰 완료 → IDLE→ANALYZING 자동 전환 (starting_phase 기반)
- 미스폰 멤버 감지 시 리마인더 주입

### L1: PreToolUse 리마인더 (`pre-tool-remind.mjs`)

- Agent 호출 시 현재 상태 컨텍스트 주입: "남은 스폰: 2명, 현재 phase: ANALYZING"
- 티켓 진행 상황 요약 주입
- 가벼운 힌트 수준 — L3/L2가 핵심, L1은 보조

### model 자동 주입 (`pre-tool-model-inject.mjs`)

- Agent 도구 호출 시 ai-party 에이전트면 model 파라미터 자동 주입
- claude-agent/leader-agent → opus, gemini-agent/codex-agent → sonnet

---

## OMC + TaskForce.AI 채택 패턴

### 채택하는 패턴

| OMC 패턴 | ai-party 적용 |
|----------|--------------|
| PreToolUse 강제 | `pre-tool-enforce.mjs` |
| 파이프라인 상태 머신 | `state-machine.mjs` |
| Worker Preamble | 에이전트 스폰 프롬프트에 포함 |
| 모드 레지스트리 | `session.json` 기반 세션 격리 |
| 원자적 JSON 쓰기 | `atomic-write.mjs` |
| 실행 통계 추적 | `session.json` execution 필드 |

| TaskForce.AI 패턴 | ai-party 적용 |
|-------------------|--------------|
| 티켓 원자화 | `.party/tickets/` (Phase 5 연동 예정) |
| dependsOn 의존성 | 티켓 `dependsOn` + Agent Teams `blockedBy` |
| 칸반 대시보드 | `/party-board` → Phase 5 웹 대시보드 |
| 이벤트 스트림 | `events.ndjson` |

### 채택하지 않는 패턴

- Swarm SQLite 태스크 풀 → Agent Teams TaskList 사용
- tmux 기반 워커 스폰 → Claude Code Agent 도구 사용
- MCP Tool 기반 핸드오프 → 파일 기반 핸드오프가 검증된 경로
- 에이전트 self-reporting → PostToolUse 훅이 자동 추적

### ai-party 차별점

| 영역 | OMC | TaskForce.AI | ai-party |
|------|-----|-------------|----------|
| 오케스트레이션 | tmux + 파일 | MCP Tool | Agent Teams API |
| 에이전트 협업 | 계층적 보고 | MCP Tool 호출 | P2P 메시징 (SendMessage) |
| 외부 AI | deprecated | Claude only | Gemini CLI + Codex CLI |
| 승인 게이트 | 없음 (자동) | 웹 UI | 필수 (CLI → 웹 진화) |
| 강제력 | 프롬프트 advisory | MCP 채널 제한 | 3계층 기계적 강제 |

---

## 체크리스트

### Step 10: 3계층 강제 모델 ✅

- [x] L3: `pre-tool-enforce.mjs` — Host 직접 도구 차단
- [x] L2: `post-tool-verify.mjs` — 스폰 추적 + 티켓 완료 체크
- [x] L1: `pre-tool-remind.mjs` — 컨텍스트 리마인더 주입
- [x] `pre-tool-model-inject.mjs` — 에이전트 model 자동 주입
- [x] `hooks.json` — PreToolUse/PostToolUse 이벤트 등록 (matcher: "Agent")

### Step 11: 파이프라인 상태 머신 + 이벤트 스트림 ✅

- [x] `state-machine.mjs` — TRANSITIONS, 가드, fix loop
- [x] `session.mjs` — session.json CRUD + 유효성 + staleness
- [x] `session-cli.mjs` / `state-cli.mjs` — CLI 인터페이스
- [x] `events.mjs` — events.ndjson 기록
- [x] `constants.mjs` — STATES, EVENT_TYPES, 경로 상수
- [x] `post-team-init.mjs` — TeamCreate 훅 세션 초기화 + 터미널 phase 가드 (v0.8.7)
- [x] `post-pipeline-state.mjs` — artifact 감지 → 자동 상태 전환
- [x] 세션 격리: 동시 파이프라인 방지 (`checkSessionLock`)

### Step 12: 티켓 시스템 — 라이브러리 ✅ / 연동 🔜 Phase 5

- [x] `lib/tickets.mjs` — CRUD + 의존성 관리 (createTicket, updateTicket, listTickets 등)
- [x] `.party/tickets/TICKET-NNN.json` 스키마 확정
- [x] `arePhaseTicketsDone()` — state-machine과 post-pipeline-state에서 참조 중 (항상 true)
- [x] 원자적 JSON 쓰기 (`atomic-write.mjs`)
- [ ] **PostToolUse 미러링**: Leader의 TaskCreate → `.party/tickets/` 자동 생성 → Phase 5
- [ ] `/party-board` 칸반: tickets 연동 후 활성화 → Phase 5

### Step 13: 요청 단위 팀 구성 + 스폰 완료 검증 ✅

- [x] teams/*.md trigger_keywords 자동 매칭
- [x] TeamCreate → post-team-init.mjs 세션 초기화
- [x] 멤버 스폰 추적 (post-tool-verify.mjs: members[].spawned)
- [x] 전원 스폰 → team_spawn_verified → IDLE→ANALYZING 자동 전환
- [x] 세션 격리 + 터미널 phase 가드
- [x] Worker Preamble (leader-agent.md, agents/*.md Team Mode)
- [ ] 에이전트 헬스 체크 (무응답 감지 → 재스폰/에스컬레이션) — 우선순위 낮음

### Step 14: 벤치마크 ❌

- [ ] 동일 작업을 3가지 방식으로 실행 비교
  - A) 단일 에이전트
  - B) 파이프라인 팀 (상태 머신 + 핸드오프)
  - C) 자유 위임
- [ ] 비교 지표: 품질, 소요 시간, 토큰 비용, 성공률, 강제성
- [ ] 벤치마크 결과 기록

### Step 15: 검증 및 배포 ❌

- [ ] `claude plugin validate .`
- [ ] 전체 파이프라인 E2E 테스트 (bugfix 팀 기준)
- [ ] marketplace.json 버전 최종 확정

---

## 버전 이력 (Phase 3)

| 버전 | 주요 변경 |
|------|----------|
| v0.7.0 | Phase 3 초기 구현 (상태 머신, 훅, 세션) |
| v0.8.0 | leader-agent 도입, auto-delegate 훅 |
| v0.8.1~v0.8.3 | 세션 초기화 안정화 |
| v0.8.4 | post-team-init.mjs 결정론적 세션 생성 |
| v0.8.5 | SKILL.md 프로젝트 탐색 금지 (Explore agent 차단) |
| v0.8.6 | hooks.json "Task"→"Agent" matcher 수정, teamName 비교 |
| v0.8.7 | TERMINAL_PHASES 가드 (COMPLETED 세션 재사용 방지) |
| v0.8.8 | pre-tool-remind/model-inject 내부 "Task"→"Agent" 잔재 수정 |
