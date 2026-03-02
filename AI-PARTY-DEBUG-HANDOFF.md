# ai-party Plugin Debug Handoff — v0.8.17 → v0.8.18

## 운영 방식

**두 개의 Claude Code** 워크플로:
- **이 세션 (분석)**: 디버그 로그 분석, 수정 방향 설계, 지시 작성
- **다른 세션 (구현)**: 실제 코드 수정, 빌드, 배포

**OMC 원칙**: "LLM에게 시키지 마라, 훅으로 강제하라" — 프롬프트 지시 대신 기계적 enforcement

---

## 프로젝트 개요

ai-party는 Claude Code 플러그인으로, 사용자 요청을 자동으로 **멀티 에이전트 팀**으로 위임한다.

### 에이전트 구성
| 에이전트 | 모델 | 역할 |
|---------|------|------|
| leader-agent | opus | 파이프라인 관리, 작업 배정 |
| claude-agent | opus | 아키텍처 분석, 코드 리뷰 |
| codex-agent | sonnet | 코드 구현 (원래는 Codex CLI 래퍼) |
| gemini-agent | sonnet | 분석, 문서화 (원래는 Gemini CLI 래퍼) |

### 파이프라인 상태 흐름
```
IDLE → ANALYZING/PLANNING → EXECUTING → REVIEWING → AWAITING_APPROVAL → APPROVED → DONE
```

### 핵심 플랫폼 제한사항
**`found=false` 문제**: Claude Code의 `handleSpawnInProcess`가 플러그인 `agents/*.md` 파일을 런타임에 로드하지 못함.
- 모든 4개 에이전트가 `found=false`로 스폰됨
- `agents/*.md`의 시스템 프롬프트, 도구 설정이 전혀 적용되지 않음
- 에이전트는 Host의 도구 세트를 공유하고 Host의 훅 파이프라인을 거침
- `mode: "bypassPermissions"`가 in-process 에이전트에 무효 → PreToolUse 훅에서 직접 승인 필요

---

## 파일 구조 (실제 실행 버전: v0.8.17 캐시)

**캐시 경로**: `/Users/winter.e/.claude/plugins/cache/atoto-claude-plugins/ai-party/0.8.17/`
**소스 워크트리**: `/Users/winter.e/easy-work/claude-plugins/.claude/worktrees/affectionate-ride/plugins/ai-party/`

> ⚠️ 소스 워크트리(package.json v0.8.1)와 캐시(v0.8.17)가 동기화되지 않음.
> 다른 Claude Code가 직접 빌드/설치하면서 캐시만 업데이트됨.
> **수정 작업은 캐시 v0.8.17 기준으로 진행해야 함.**

### 훅 파일 (v0.8.17 캐시 기준)

```
hooks/
├── hooks.json              # 훅 등록 매니페스트
├── auto-delegate.mjs       # UserPromptSubmit: 팀 모드 위임 주입
├── pre-tool-enforce.mjs    # PreToolUse(*): 파이프라인 중 Host 직접 도구 차단
├── pre-tool-auto-approve.mjs  # PreToolUse(*): 파이프라인 활성 시 도구 자동 승인 ← 수정 대상
├── pre-tool-remind.mjs     # PreToolUse(Agent): 파이프라인 컨텍스트 리마인더
├── pre-tool-agent-inject.mjs  # PreToolUse(Agent): mode/model/CLI hint 주입
├── post-team-init.mjs      # PostToolUse(TeamCreate): session.json 생성
├── post-tool-verify.mjs    # PostToolUse(Agent): 스폰 추적, 전원 스폰 시 auto-start
├── post-agent-verify.mjs   # PostToolUse(Agent): 에이전트 출력 검증
└── post-pipeline-state.mjs # PostToolUse(*): artifact 기반 phase 자동 전환
```

### hooks.json 구조 (v0.8.17)
```json
{
  "PreToolUse": [
    { "matcher": "", "hooks": ["pre-tool-enforce.mjs", "pre-tool-auto-approve.mjs"] },
    { "matcher": "Agent", "hooks": ["pre-tool-remind.mjs", "pre-tool-agent-inject.mjs"] }
  ],
  "UserPromptSubmit": [
    { "matcher": "", "hooks": ["auto-delegate.mjs"] }
  ],
  "PostToolUse": [
    { "matcher": "TeamCreate", "hooks": ["post-team-init.mjs"] },
    { "matcher": "Agent", "hooks": ["post-tool-verify.mjs", "post-agent-verify.mjs"] },
    { "matcher": "", "hooks": ["post-pipeline-state.mjs"] }
  ]
}
```

---

## 플랫폼 PreToolUse 훅 스키마

```json
{
  "decision": "\"approve\" | \"block\" (optional) — 도구 호출 자체 승인/차단",
  "permissionDecision": "\"allow\" | \"deny\" | \"ask\" (optional) — 권한 프롬프트 제어",
  "message": "string (optional) — deny 시 LLM에 전달하는 메시지",
  "hookSpecificOutput": {
    "for PreToolUse": {
      "permissionDecision": "\"allow\" | \"deny\" | \"ask\" (optional)",
      "updatedInput": "object (optional) — 도구 입력 수정"
    }
  }
}
```

**핵심**: `decision`과 `permissionDecision`은 **별개 필드**:
- `decision: "approve"` → 도구 호출 자체를 즉시 승인 (block하면 호출 중단)
- `permissionDecision: "allow"` → 권한 프롬프트(사용자 확인 UI)를 건너뜀

---

## 버전 히스토리 & 디버그 결과

### v0.8.14 → v0.8.15
- `mode: 'dontAsk'` → `mode: 'bypassPermissions'` 변경
- bypassPermissions가 in-process agent에 무효하다는 발견

### v0.8.16
- `pre-tool-auto-approve.mjs` 신설 — `{ decision: "allow" }` 반환
- **결과**: validation 실패 213건 (`decision` 필드에 "allow"는 유효하지 않음)
- **원인**: `decision`은 "approve"|"block"만 허용, "allow"는 `permissionDecision`의 값

### v0.8.17 (현재)
- `{ decision: "allow" }` → `{ permissionDecision: "allow" }` 수정
- auto-delegate.mjs에 `model='opus'`/`model='sonnet'` 파라미터 추가
- pre-tool-agent-inject.mjs에서 `if (!toolInput.model)` 가드 제거 → 항상 AGENT_MODEL_MAP 강제

**v0.8.17 디버그 결과** (로그: `/Users/winter.e/.claude/debug/d85014e5-e1da-4a92-af43-9bcb425e4b78.txt`, 14,702줄):

| 지표 | v0.8.16 | v0.8.17 | 변화 |
|------|---------|---------|------|
| hook validation 실패 | 213+ | **0** | ✅ 해결 |
| permissionDecision:allow 성공 | 0 | **393** | ✅ 99.5% |
| permission_prompt 발생 | 5 | **2** | ⬇️ 60% 감소 |
| 모델 (haiku) | 전원 haiku | **0 haiku** | ✅ 전원 sonnet/opus |
| acceptEdits 제안 | 6 | 8 | ⬆️ (sonnet이 더 많은 도구 호출) |
| CLI 래퍼 실행 | 0 | 0 | ❌ 여전히 미사용 |
| Phase 전환 | 4/4 | 4/4 | ✅ 유지 |
| Team spawn | 4/4 | 4/4 | ✅ 유지 |
| Streaming stall | 43-87s | 71-115s | ⬆️ (sonnet 응답 길이 증가) |

### v0.8.17 잔존 이슈 상세

#### 1. permission_prompt 2건 누출
- **위치**: Edit 도구 (L11944, 6.2초 후), Write 도구 (L13867, 6.1초 후)
- **패턴**: `permissionDecision:"allow"` validation 통과 → 6초 후 별도의 permission_prompt 발동
- **추정 원인**: 플랫폼에 PreToolUse와 별도의 PermissionRequest 시스템이 존재할 가능성
- **해결 방향**: `decision: "approve"` 추가로 도구 호출 자체를 즉시 승인 → permission check 단계 우회

#### 2. CLI 래퍼 미사용
- codex_exec.sh / gemini_exec.sh 실행 0건
- sonnet 모델임에도 CRITICAL INSTRUCTION 프롬프트 힌트 완전 무시
- 에이전트들이 Read/Grep/Bash로 직접 작업 수행 (기능적으로는 정상 동작)
- **해결 방향**: v0.8.18에서는 보류 (PreToolUse payload에 호출 에이전트 정보 없어서 선택적 차단 불가)

#### 3. acceptEdits 8건
- 플랫폼이 Edit/Write 도구에 대해 acceptEdits 모드를 제안
- `bypassPermissions`가 in-process agent에 무효하므로 발생
- auto-approve 훅으로 대부분 처리되지만 일부 leak

---

## v0.8.18 수정 사항

### 수정 1: pre-tool-auto-approve.mjs — 두 필드 모두 사용

```javascript
// 변경 전 (v0.8.17, line 54):
process.stdout.write(JSON.stringify({ permissionDecision: "allow" }));

// 변경 후 (v0.8.18):
process.stdout.write(JSON.stringify({ decision: "approve", permissionDecision: "allow" }));
```

**이유**:
- `decision: "approve"` → 도구 호출을 즉시 승인하여 후속 permission check 단계 진입 차단
- `permissionDecision: "allow"` → 기존 393건 성공 유지
- 두 메커니즘을 동시 사용하여 나머지 2건 Edit/Write 누출 해소

### 수정 2: pre-tool-enforce.mjs — deny에 decision:"block" 추가

session.json 보호 (line 37-43):
```javascript
// 변경 전:
const result = { permissionDecision: "deny", message: "..." };

// 변경 후:
const result = { decision: "block", permissionDecision: "deny", message: "..." };
```

BLOCKED_TOOLS 차단 (line 94-99):
```javascript
// 변경 전:
const result = { permissionDecision: "deny", message: "..." };

// 변경 후:
const result = { decision: "block", permissionDecision: "deny", message: "..." };
```

### 수정 3: 버전 범프

manifest/package.json version → `0.8.18`

### ⚠️ 하지 말 것
- `permissionDecision:"allow"`를 `decision:"approve"`로 **교체**하지 마라 (기존 393건 성공 손실)
- CLI 래퍼 관련 수정 (v0.8.18 범위 아님)
- hooks.json 구조 변경 (현재 정상 동작)

---

## 디버그 로그 분석 방법

### 로그 위치
테스트 시 `claude --debug` 플래그로 실행하면 로그 파일 생성됨.
형식: `/Users/winter.e/.claude/debug/{uuid}.txt`

### 핵심 grep 패턴

```bash
# 1. 훅 validation 결과 (실패 0이면 정상)
grep -c "Hook validation failed" <log>

# 2. permissionDecision:allow 성공 횟수
grep -c '"permissionDecision":"allow"' <log>
grep -c 'permissionDecision.*allow' <log>

# 3. permission_prompt 발생 (0이면 완벽)
grep -c "permission_prompt" <log>

# 4. 모델 확인 (haiku 0이면 정상)
grep -c "Tool search disabled for haiku" <log>
grep "Auto tool search" <log> | head -5

# 5. CLI 래퍼 실행
grep -c "codex_exec\|gemini_exec" <log>

# 6. found=false 확인 (플랫폼 제한, 변경 불가)
grep "found" <log> | grep -i "false" | head -5

# 7. acceptEdits 제안
grep -c "acceptEdits" <log>

# 8. Phase 전환
grep "phase_changed\|transition" <log>

# 9. 스폰 추적
grep "agent_spawned\|TEAM_SPAWN_VERIFIED" <log>

# 10. Streaming stall (30초 이상 idle)
grep "streaming.*stall\|idle.*[3-9][0-9]s\|idle.*1[0-9][0-9]s" <log>
```

### v0.8.18 테스트 후 확인할 지표
1. **permission_prompt: 0건** (v0.8.17에서 2건 → 0건 목표)
2. **hook validation 실패: 0건** (유지)
3. **permissionDecision:allow: ~393건** (유지)
4. **decision:approve 출현** (신규 — 확인 필요)
5. **모델 전원 sonnet/opus** (유지)
6. **Phase 전환 정상** (유지)

---

## 소스 코드 참조 (v0.8.17 캐시 전체 경로)

| 파일 | 경로 |
|------|------|
| hooks.json | `/Users/winter.e/.claude/plugins/cache/atoto-claude-plugins/ai-party/0.8.17/hooks/hooks.json` |
| auto-approve | `/Users/winter.e/.claude/plugins/cache/atoto-claude-plugins/ai-party/0.8.17/hooks/pre-tool-auto-approve.mjs` |
| enforce | `/Users/winter.e/.claude/plugins/cache/atoto-claude-plugins/ai-party/0.8.17/hooks/pre-tool-enforce.mjs` |
| agent-inject | `/Users/winter.e/.claude/plugins/cache/atoto-claude-plugins/ai-party/0.8.17/hooks/pre-tool-agent-inject.mjs` |
| auto-delegate | `/Users/winter.e/.claude/plugins/cache/atoto-claude-plugins/ai-party/0.8.17/hooks/auto-delegate.mjs` |
| constants | `/Users/winter.e/.claude/plugins/cache/atoto-claude-plugins/ai-party/0.8.17/lib/constants.mjs` |
| v0.8.17 로그 | `/Users/winter.e/.claude/debug/d85014e5-e1da-4a92-af43-9bcb425e4b78.txt` |

---

## 미래 과제 (v0.8.18 이후)

1. **CLI 래퍼 enforcement**: PreToolUse에 에이전트 식별 메커니즘 필요
2. **소스 워크트리 동기화**: 캐시와 소스 코드 불일치 해소
3. **Streaming stall 개선**: sonnet 응답 길이 증가로 71-115초 stall
4. **acceptEdits 완전 제거**: 플랫폼 레벨 해결 필요할 수 있음
