---
description: Show kanban board view of current party session tickets
allowed-tools: Read, Glob
---

# /party-board

현재 파티 세션의 티켓을 칸반 보드 형태로 표시한다.

## Protocol

### Step 1: 세션 확인

`.party/session.json`을 읽는다. 파일이 없으면 "활성 파티 세션이 없습니다"를 표시한다.

### Step 2: 티켓 로드

`.party/tickets/TICKET-*.json` 파일들을 모두 읽는다. 티켓이 없으면 "티켓이 없습니다. 파이프라인이 아직 티켓을 생성하지 않았습니다."를 표시한다.

### Step 3: 칸반 보드 출력

티켓을 status 기준으로 4개 컬럼에 그룹핑하여 출력한다:

```
═══════════════════════════════════════════════════════════════
 BLOCKED        │ TODO           │ IN_PROGRESS    │ DONE
═══════════════════════════════════════════════════════════════
 T-005 통합테스트│ T-003 API구현   │ T-004 단위테스트│ T-001 분석
   ← T-003,T-004│   ← T-001,T-002│   @codex       │   @gemini
               │                │               │ T-002 설계
               │                │               │   @claude
═══════════════════════════════════════════════════════════════
```

각 티켓 카드에 표시할 내용:
- `T-NNN` 티켓 ID (TICKET-NNN의 약칭)
- 티켓 제목 (한 줄, 10자 이내로 축약)
- `@assignee` 담당 에이전트
- `← dep` dependsOn 의존성 (BLOCKED인 경우만)

### Step 4: 요약 정보

보드 하단에 파이프라인 컨텍스트를 표시한다:

```
Pipeline: {session.id}  │  Phase: {session.phase}  │  Team: {session.team}
Tickets: {done}/{total} completed  │  Task: {session.task}
```

### Step 5: 에이전트 상태

session.json의 members 정보로 에이전트 활동 상태를 표시한다:

```
Agents:
  ● codex-agent(builder)   [SPAWNED]  Working on T-004
  ● gemini-agent(analyst)  [SPAWNED]  Done
  ○ claude-agent(reviewer) [PENDING]  Waiting
```

- `●` spawned=true, `○` spawned=false
