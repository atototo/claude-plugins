# AI Party v2 아키텍처 방향 — 종합 분석

> TaskForce.AI + OMC(oh-my-claudecode) + 현재 ai-party를 종합하여
> "프로젝트별 요청 → 티켓화 → 팀 구성 → 칸반 프로세스 → 승인" 시스템의 최적 경로를 도출한다.

---

## 1. 목표 재정의

```
사용자가 요청을 던지면:
  1. 요청이 티켓(들)으로 원자화된다
  2. 적절한 팀이 자동 구성된다
  3. 에이전트들이 티켓을 처리한다 (병렬/순차)
  4. 진행 과정이 칸반 보드에 실시간 반영된다
  5. 사용자가 결과를 보고 승인/거절/수정 지시한다
```

**핵심 차별점**: TaskForce.AI는 "보는 도구"이고, 우리는 "실행 엔진 + 보는 도구"다.

---

## 2. 세 가지 레퍼런스 비교

| 관점 | TaskForce.AI | OMC | ai-party (현재) |
|------|-------------|-----|----------------|
| **오케스트레이션** | MCP Tool 기반 | tmux + 파일 기반 | Agent Teams API |
| **태스크 관리** | MCP Tool (create_ticket 등) | 파일 큐 (inbox/outbox) | TaskCreate/TaskUpdate API |
| **상태 변경** | 에이전트가 MCP Tool 호출 | bridge daemon이 관리 | 훅이 자동 전환 |
| **의존성** | Block/Unblock (DAG) | 순차 큐 | Phase 상태 머신 (선형) |
| **가시성** | 웹 칸반 대시보드 | tmux TUI | CLI (/party-status) |
| **승인** | 웹 UI | 없음 (자율 실행) | AskUserQuestion |
| **외부 AI** | Claude only | Codex/Gemini CLI | Codex/Gemini CLI |
| **강제력** | MCP Tool = 행동 채널 제한 | 프롬프트 advisory | PreToolUse deny + 훅 |

### 각각의 강점

**TaskForce.AI에서 가져올 것:**
- MCP Tool로 에이전트 행동 채널 만들기 (파일 직접 쓰기 대신 도구 호출)
- 웹 칸반 대시보드의 UX 패턴
- 티켓 원자화 패턴 (TASK-001, TASK-002)

**OMC에서 가져올 것:**
- Provider Contract 패턴 (CLI별 추상화)
- Bridge daemon 아키텍처 (장시간 실행 워커 관리)
- 사용량 추적 (model, duration, char counts)

**ai-party에서 유지할 것:**
- Agent Teams API 기반 스폰 (Claude 공식 지원)
- 상태 머신 + artifact guard (이미 잘 동작)
- 훅 기반 enforcement (PreToolUse deny)
- 팀 프리셋 시스템

---

## 3. 아키텍처 방향: 두 레이어 분리

```
┌─────────────────────────────────────────────────────────┐
│  Layer A: Execution Engine (ai-party 플러그인 진화)       │
│  = Claude Code 안에서 동작하는 실행 엔진                  │
│  = Agent Teams + 훅 + 상태 머신                          │
│  = 터미널에서 독립적으로 사용 가능                        │
└────────────────────┬────────────────────────────────────┘
                     │ 이벤트 발행 (NDJSON / WebSocket)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Layer B: Dashboard (별도 프로세스 — 웹 앱)               │
│  = 칸반 보드 + 실시간 상태 + 승인 UI                     │
│  = Layer A의 이벤트를 구독하여 시각화                     │
│  = 승인/거절을 Layer A에 피드백                          │
└─────────────────────────────────────────────────────────┘
```

### 왜 분리하는가

1. **ai-party는 이미 터미널에서 동작한다** — 대시보드 없이도 `/party` + `/party-status`로 사용 가능
2. **대시보드는 선택사항** — 대시보드 없어도 실행 엔진은 완전히 기능함
3. **관심사 분리** — 실행 로직과 UI가 독립적으로 진화
4. **TaskForce.AI도 이 구조** — MCP 서버(실행) + 웹앱(대시보드) 분리

---

## 4. Layer A: 실행 엔진 개선 방향

### 4.1 현재 ai-party의 한계

```
1. 파일 직접 쓰기 의존
   - 에이전트가 .party/findings/analysis.md를 직접 Write
   - 포맷 불일치, 누락, 잘못된 경로 가능

2. 상태 전환이 훅 기반 자동만
   - post-pipeline-state.mjs가 파일 존재만 체크
   - 내용 품질 검증 없음

3. 티켓 개념 부재
   - "phase"는 있지만 "ticket"이 없음
   - 하나의 요청 = 하나의 파이프라인 (병렬 요청 불가)

4. 이벤트 스트림 없음
   - 외부 프로세스가 상태를 알려면 session.json 폴링 필요
   - 실시간 업데이트 불가
```

### 4.2 개선: MCP Tool 기반 핸드오프 도입

TaskForce.AI의 핵심 인사이트를 적용한다.

```
현재:
  에이전트 → Write("findings/analysis.md", content) → 훅이 파일 감지 → 상태 전환

개선:
  에이전트 → MCP Tool: submit_findings(phase, content, metadata) → 서버가 검증/저장/이벤트 발행/상태 전환
```

**MCP 서버 도구 설계:**

```typescript
// ai-party MCP 서버가 제공하는 도구들
tools: {
  // 티켓 관리
  create_ticket: (title, description, phase, assignee, blockedBy?) => Ticket
  update_ticket: (ticketId, status, report?) => void
  list_tickets: (filter?) => Ticket[]

  // Findings 제출 (파일 직접 쓰기 대체)
  submit_findings: (phase, content, metadata) => {
    // 1. content 검증 (비어있으면 reject)
    // 2. findings 파일 저장
    // 3. 이벤트 발행
    // 4. 상태 전환 트리거
  }

  // 상태 조회
  get_pipeline_status: () => PipelineStatus
  get_team_status: () => TeamMemberStatus[]

  // 승인 (대시보드 또는 터미널에서)
  request_approval: (summary, findings) => void
  submit_decision: (decision, feedback?) => void
}
```

**그러나 현실적 제약:**

```
⚠️ 서브에이전트(Task로 스폰된 에이전트)가 MCP Tool을 사용할 수 있는지?
   → Claude Code의 Agent Teams에서 서브에이전트는 Host의 MCP 서버에 접근 가능
   → 단, 서브에이전트 스폰 시 명시적으로 MCP tool을 allowed-tools에 포함해야 함
   → 이것은 검증 필요

⚠️ MCP 서버가 플러그인 안에서 동작할 수 있는지?
   → Claude Code 플러그인은 hooks + commands + skills 구조
   → MCP 서버는 settings.json의 mcpServers로 등록
   → 플러그인이 MCP 서버를 번들할 수 있는지 확인 필요
```

### 4.3 개선: 티켓 시스템 도입

현재의 "phase" 단위에서 "ticket" 단위로 세분화한다.

```
현재:
  요청 → ANALYZING → PLANNING → EXECUTING → REVIEWING → APPROVAL
  (하나의 요청 = 하나의 파이프라인)

개선:
  요청 → 원자화 → Ticket들

  요청: "예약 취소 API를 만들어줘"
    ├── TICKET-001: API 스펙 분석 (analyzing)
    ├── TICKET-002: DB 스키마 설계 (planning, blocked by 001)
    ├── TICKET-003: API 엔드포인트 구현 (executing, blocked by 002)
    ├── TICKET-004: 단위 테스트 작성 (executing, blocked by 003)
    ├── TICKET-005: 통합 테스트 (reviewing, blocked by 003, 004)
    └── TICKET-006: 코드 리뷰 (reviewing, blocked by 003)
```

**티켓 상태:**
```
TODO → IN_PROGRESS → IN_REVIEW → DONE
  ↑                     │
  └── BLOCKED ←─────────┘ (rejected)
```

**기존 phase 상태 머신과의 관계:**
```
Phase는 유지한다. 티켓은 phase 안에서의 세부 작업 단위.

ANALYZING phase:
  - TICKET-001 (TODO → IN_PROGRESS → DONE)

PLANNING phase:
  - TICKET-002 (BLOCKED → TODO → IN_PROGRESS → DONE)

EXECUTING phase:
  - TICKET-003 (BLOCKED → TODO → IN_PROGRESS → DONE)
  - TICKET-004 (BLOCKED → TODO → IN_PROGRESS → DONE)
  (병렬 가능)

REVIEWING phase:
  - TICKET-005 (BLOCKED → TODO → IN_PROGRESS → DONE)
  - TICKET-006 (BLOCKED → TODO → IN_PROGRESS → DONE)
```

### 4.4 개선: 이벤트 스트림 도입

대시보드 연동을 위한 이벤트 시스템.

```
이벤트 저장: .party/events.ndjson (append-only)
이벤트 실시간 전달: 파일 감시 (fs.watch) 또는 Unix socket

이벤트 포맷:
{
  "ts": "2026-02-28T04:30:00Z",
  "type": "ticket_updated",
  "ticketId": "TICKET-003",
  "data": {
    "status": "IN_PROGRESS",
    "assignee": "codex-builder",
    "phase": "EXECUTING"
  }
}
```

**이벤트 타입:**
```
pipeline_started     — 파이프라인 시작
pipeline_completed   — 파이프라인 완료
phase_changed        — 페이즈 전환
ticket_created       — 티켓 생성
ticket_updated       — 티켓 상태 변경
findings_submitted   — 산출물 제출
approval_requested   — 승인 요청
decision_made        — 사용자 결정
agent_spawned        — 에이전트 스폰
agent_completed      — 에이전트 완료
error_occurred       — 오류 발생
```

---

## 5. Layer B: 대시보드 방향

### 5.1 최소 기능 (MVP)

```
┌──────────────────────────────────────────────────────┐
│  AI Party Dashboard                        [Refresh] │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Pipeline: party-bugfix-20260228    Status: EXECUTING│
│  Task: Fix NPE in ReportService                      │
│                                                      │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  TODO    │ │IN PROGRESS│ │IN REVIEW │ │  DONE   │ │
│  │         │ │          │ │          │ │         │ │
│  │ T-005   │ │ T-003    │ │          │ │ T-001   │ │
│  │ T-006   │ │ T-004    │ │          │ │ T-002   │ │
│  │         │ │          │ │          │ │         │ │
│  └─────────┘ └──────────┘ └──────────┘ └─────────┘ │
│                                                      │
│  Agents:                                             │
│  ● codex-builder   [EXECUTING] T-003  2m30s          │
│  ● codex-tester    [EXECUTING] T-004  1m15s          │
│  ○ claude-reviewer [WAITING]                         │
│  ✓ gemini-analyst  [DONE]                            │
│  ✓ claude-architect [DONE]                           │
│                                                      │
│  [Approve] [Reject] [Revise]         Phase: 3/5     │
└──────────────────────────────────────────────────────┘
```

### 5.2 기술 스택 선택지

```
옵션 A: 터미널 TUI (blessed/ink)
  + ai-party 플러그인 안에서 바로 실행
  + 별도 프로세스 불필요
  - 시각적 한계, 모바일 접근 불가

옵션 B: 로컬 웹앱 (Next.js / Vite + React)
  + 풍부한 UI, 실시간 업데이트 쉬움
  + 나중에 원격 접근으로 확장 가능
  - 별도 프로세스 실행 필요
  - 의존성 증가

옵션 C: HTML 파일 생성 (정적)
  + 의존성 제로, 브라우저만 있으면 됨
  + .party/dashboard.html로 생성, 브라우저로 열기
  - 실시간 업데이트 어려움 (폴링 필요)
  - 승인 인터랙션 제한적
```

**권장: 옵션 B (로컬 웹앱) — 단, Phase 2에서**

Phase 1에서는 기존 `/party-status` CLI + events.ndjson으로 충분.
Phase 2에서 events.ndjson을 읽는 웹앱을 별도로 만든다.

---

## 6. 구현 로드맵

### Phase 1: 실행 엔진 강화 (ai-party v0.8)

```
목표: 티켓 시스템 + 이벤트 스트림 + 개선된 상태 관리
기반: 현재 ai-party 코드 활용

변경 사항:
  lib/
    tickets.mjs          — 티켓 CRUD + 의존성 관리
    events.mjs           — 이벤트 발행 (events.ndjson append)
    session.mjs          — 티켓 연동 추가
    state-machine.mjs    — 티켓 완료 기반 phase 전환
    constants.mjs        — 티켓 상태 상수 추가

  hooks/
    post-pipeline-state.mjs — 티켓 완료 감지 → phase 전환
    post-agent-verify.mjs   — 티켓 상태 자동 업데이트

  commands/
    party.md             — 티켓 생성 프로토콜 추가
    party-status.md      — 티켓 기반 상태 표시

런타임 디렉토리:
  .party/
    session.json         — 기존 유지
    events.ndjson        — NEW: 이벤트 스트림
    tickets/
      TICKET-001.json    — NEW: 개별 티켓 파일
      TICKET-002.json
      ...
    findings/            — 기존 유지
```

**티켓 파일 스키마:**
```json
{
  "id": "TICKET-001",
  "title": "API 스펙 분석",
  "description": "현재 예약 API의 엔드포인트와 스키마를 분석한다",
  "phase": "ANALYZING",
  "status": "DONE",
  "assignee": "gemini-analyst",
  "blockedBy": [],
  "createdAt": "2026-02-28T04:30:00Z",
  "startedAt": "2026-02-28T04:30:05Z",
  "completedAt": "2026-02-28T04:32:00Z",
  "findings": "findings/analysis.md",
  "report": "Root cause identified: Map.of() with null value"
}
```

### Phase 2: 대시보드 MVP

```
목표: events.ndjson을 읽어 칸반 보드를 표시하는 웹앱
별도 프로젝트 또는 tools/ 디렉토리

기능:
  - .party/events.ndjson 파일 감시 (fs.watch)
  - 칸반 보드: TODO / IN_PROGRESS / IN_REVIEW / DONE
  - 에이전트 상태 표시
  - 승인 버튼 → .party/approvals/ 에 파일 기록 → ai-party가 감지
  - 여러 프로젝트 지원 (프로젝트 경로 입력)
```

### Phase 3: MCP Tool 기반 핸드오프 (선택)

```
목표: 파일 직접 쓰기 → MCP Tool 호출로 전환
검증 필요: 서브에이전트의 MCP Tool 접근 가능 여부

조건: Phase 1이 안정적으로 동작한 후
이유: MCP 방식이 더 깔끔하지만, 검증 안 된 경로에 의존하면 위험
```

---

## 7. Phase 1 상세 설계

### 7.1 tickets.mjs

```javascript
// 핵심 인터페이스
export function createTicket({ title, description, phase, assignee, blockedBy }) → Ticket
export function updateTicket(ticketId, updates) → Ticket
export function getTicket(ticketId) → Ticket | null
export function listTickets(filter?) → Ticket[]
export function isTicketBlocked(ticketId) → boolean
export function getPhaseTickets(phase) → Ticket[]
export function arePhaseTicketsDone(phase) → boolean
```

### 7.2 events.mjs

```javascript
// 이벤트 발행
export function emit(type, data) {
  const event = {
    ts: new Date().toISOString(),
    type,
    data,
    sessionId: getCurrentSessionId()
  };
  appendFileSync(
    join(cwd, PARTY_DIR, 'events.ndjson'),
    JSON.stringify(event) + '\n'
  );
}

// 이벤트 타입
export const EVENT_TYPES = {
  PIPELINE_STARTED: 'pipeline_started',
  PHASE_CHANGED: 'phase_changed',
  TICKET_CREATED: 'ticket_created',
  TICKET_UPDATED: 'ticket_updated',
  FINDINGS_SUBMITTED: 'findings_submitted',
  APPROVAL_REQUESTED: 'approval_requested',
  DECISION_MADE: 'decision_made',
  AGENT_SPAWNED: 'agent_spawned',
  AGENT_COMPLETED: 'agent_completed',
};
```

### 7.3 state-machine.mjs 변경

```javascript
// 기존: 파일 존재만 체크
if (existsSync(phaseConfig.artifact)) → transition

// 변경: 해당 phase의 모든 티켓 완료 체크
if (arePhaseTicketsDone(currentPhase)) → transition
// + 기존 artifact 체크도 유지 (하위 호환)
```

### 7.4 party.md 변경

```markdown
### Step 3.5: 티켓 원자화 (NEW)

Leader 스폰 시 프롬프트에 추가:

"After initializing session.json, atomize the task into tickets:
1. Analyze the task and break it into atomic work units
2. For each unit, create a ticket file in .party/tickets/
3. Set dependencies (blockedBy) between tickets
4. Assign each ticket to the appropriate team member
5. Send each worker their ticket IDs via SendMessage"
```

### 7.5 /party-board 커맨드 (NEW)

```markdown
---
description: Show kanban board view of current party session
allowed-tools: Read, Glob
---

# /party-board

칸반 보드 형태로 현재 세션의 티켓 상태를 표시한다.

## Protocol

1. .party/tickets/*.json 읽기
2. 상태별 그룹핑
3. 칸반 형태로 출력:

```
═══════════════════════════════════════════════════════
 TODO          │ IN PROGRESS   │ IN REVIEW    │ DONE
═══════════════════════════════════════════════════════
 T-005 통합테스트│ T-003 API구현  │              │ T-001 분석
 T-006 코드리뷰 │ T-004 단위테스트│              │ T-002 설계
═══════════════════════════════════════════════════════
```
```

---

## 8. Agent Teams API 최신 상태 (2026년 2월 기준)

조사 결과 확인된 사실들:

### 공식 도구 (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)

| 도구 | 용도 |
|------|------|
| `TeamCreate` | 팀 생성. `~/.claude/teams/<team_name>/config.json` 생성 |
| `TaskCreate` | 태스크 생성. JSON 파일로 디스크에 저장 |
| `TaskUpdate` | 상태 변경, `addBlockedBy`로 의존성 체이닝 |
| `TaskList` | 팀의 모든 태스크 목록/상태 조회 |
| `SendMessage` | 팀원 간 직접 메시징 (허브-스포크가 아닌 P2P) |
| `TeamDelete` | 팀 리소스 정리 |

### 핵심 제약

```
1. 팀원은 다른 팀원을 스폰할 수 없음 (Host만 스폰 가능)
2. 한 세션에 한 팀만 가능
3. 리더십 이전 불가 (Host가 항상 리더)
4. 팀원은 Host의 대화 히스토리를 상속받지 않음
5. 권한은 팀원 모두 동일 (차별화 불가)
6. 인프로세스 팀원은 세션 재개 시 복원 안 됨
7. 팀원이 태스크 완료 마킹을 안 하는 경우 있음 → 수동 개입 필요
```

### 비용 현실

```
솔로 세션:    ~200K 토큰
3인 팀:       ~800K 토큰 (4x)
5인 팀:       ~1.2M+ 토큰 (6x)
권장 규모:    2-5명, 팀원당 5-6 태스크
```

### 검증된 사례

- Anthropic 내부: 16 에이전트로 Rust C 컴파일러 작성 (Linux 커널 빌드 가능)
  - ~2,000 세션, $20,000 API 비용, 100K 라인 코드
- 스폰 백엔드: in-process, tmux split-pane, iTerm2 split-pane

### MCP 관련

```
⚠️ Agent Teams는 MCP 기반이 아님 — 파일시스템 기반 조정 메커니즘
⚠️ 커뮤니티 도구들(claude-code-mcp, ruflo 등)이 MCP 기반 대안 제공
⚠️ 즉, MCP Tool을 서브에이전트에게 제공하는 것은 별도 검증 필요
```

**시사점**: 우리 ai-party의 Agent Teams 기반 접근은 정확히 맞는 방향.
단, "팀원이 태스크 완료를 안 하는" 문제는 PostToolUse 훅으로 보완 중 (이미 구현됨).

---

## 9. 결정이 필요한 사항

### Q1: 대시보드 시점
- **A)** Phase 1에서 터미널 칸반(/party-board)만 만들고, 웹은 나중에
- **B)** Phase 1에서 바로 간단한 웹 대시보드도 함께 만들기

### Q2: MCP Tool 방식
- **A)** Phase 1은 파일 기반 유지, Phase 3에서 MCP 검증 후 전환
- **B)** Phase 1부터 MCP 서버를 만들어 시작

### Q3: 티켓 저장 방식
- **A)** 개별 JSON 파일 (.party/tickets/TICKET-001.json)
- **B)** 단일 파일 (.party/tickets.json에 배열)

### Q4: 외부 AI 통합
- **A)** 현재 방식 유지 (Codex/Gemini는 Bash 스크립트 래퍼)
- **B)** OMC 방식 도입 (Provider Contract + Bridge)

---

## 10. 권장 결정

| 질문 | 권장 | 이유 |
|------|------|------|
| Q1 | **A** (터미널 먼저) | 실행 엔진이 안정화돼야 대시보드가 의미 있음 |
| Q2 | **A** (파일 먼저) | Agent Teams는 MCP 기반이 아님 (파일시스템 조정). 검증된 경로 우선 |
| Q3 | **A** (개별 파일) | Agent Teams 자체가 JSON 파일로 태스크 관리. 패턴 일관성 + 동시 접근 안전 |
| Q4 | **A** (현재 유지) | Provider Contract는 좋지만 지금 급하지 않음 |

---

## 10. 핵심 인사이트 요약

```
1. TaskForce.AI가 증명한 것:
   → MCP Tool로 에이전트 행동 채널을 만들면 준수율이 올라감
   → 칸반 대시보드는 사용자 경험을 근본적으로 바꿈
   → 하지만 "실행 엔진"은 따로 필요 (TaskForce.AI는 대시보드만)

2. OMC가 보여준 것:
   → 외부 CLI 통합은 Provider Contract로 추상화 가능
   → Bridge 패턴으로 장시간 워커 관리 가능
   → 하지만 프롬프트 advisory 방식의 한계 (강제력 없음)

3. ai-party가 이미 가진 것:
   → Agent Teams 기반 스폰 (공식 지원)
   → PreToolUse deny 기반 기계적 강제
   → 상태 머신 + artifact guard
   → 팀 프리셋 시스템

4. 부족한 것:
   → 티켓 단위의 세분화 (phase만 있고 ticket이 없음)
   → 이벤트 스트림 (외부 시스템 연동 불가)
   → 대시보드 (CLI 텍스트만)
   → 병렬 요청 처리
```

**결론: ai-party에 "티켓 시스템 + 이벤트 스트림"을 추가하는 것이 가장 빠르고 안전한 경로다.**
**대시보드는 이벤트 스트림이 안정화된 후 별도로 만든다.**

---

## Appendix: 조사 출처

### Agent Teams API
- [공식 문서: Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams)
- [공식 문서: Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code's Hidden Multi-Agent System - paddo.dev](https://paddo.dev/blog/claude-code-hidden-swarm/)
- [Agent Teams: The Switch Got Flipped - paddo.dev](https://paddo.dev/blog/agent-teams-the-switch-got-flipped/)
- [From Tasks to Swarms - alexop.dev](https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/)
- [Anthropic's C Compiler with 16 agents](https://www.anthropic.com/engineering/building-c-compiler)

### 검증 사실
- Agent Teams는 2026년 2월 초 Claude Opus 4.6과 함께 공식 출시
- 파일시스템 기반 조정 메커니즘 (MCP 아님)
- 스폰 백엔드: in-process, tmux, iTerm2
- 권장 규모: 2-5 팀원, 팀원당 5-6 태스크
