# Phase 4-6: AI OPS 플랫폼 + 대시보드 + 프로덕션

> ai-party 플러그인은 "실행 엔진"으로 남고, 플랫폼은 별도 프로젝트.
> 플랫폼이 "무엇을 할지" 결정하고, 플러그인이 "어떻게 할지" 실행한다.
> 관련: [index.md](index.md) | 이전 ← [phase3.md](phase3.md)

---

## 전체 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                    AI OPS Platform (별도 프로젝트)          │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ 프로젝트     │  │ 보안 저장소   │  │ 세션/이력     │    │
│  │ 레지스트리   │  │              │  │ 저장소        │    │
│  │             │  │ API keys     │  │              │    │
│  │ repo URL    │  │ SSH keys     │  │ sessions     │    │
│  │ 브랜치 전략  │  │ DB 접속정보   │  │ findings     │    │
│  │ 기술 스택    │  │ 토큰 (암호화) │  │ approvals    │    │
│  │ 컨벤션      │  │              │  │ benchmarks   │    │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘    │
│         └────────────────┼──────────────────┘            │
│                    SQLite DB                              │
│                          │                               │
│  ┌──────────────┐  ┌─────┴───────────┐  ┌────────────┐  │
│  │ MCP Server   │  │   REST API      │  │  Webhook   │  │
│  │ (AI 전용)    │  │  (사람 전용)     │  │  (외부)    │  │
│  │              │  │                 │  │            │  │
│  │ tools:       │  │ /tickets CRUD   │  │ GitHub     │  │
│  │ - get_       │  │ /projects CRUD  │  │ 모니터링   │  │
│  │   project_   │  │ /approvals      │  │ cron       │  │
│  │   context    │  │ /dashboard      │  │            │  │
│  │ - create_    │  │                 │  │            │  │
│  │   ticket     │  │                 │  │            │  │
│  │ - request_   │  │                 │  │            │  │
│  │   approval   │  │                 │  │            │  │
│  │ - get_       │  │                 │  │            │  │
│  │   session_   │  │                 │  │            │  │
│  │   status     │  │                 │  │            │  │
│  └──────┬───────┘  └─────────────────┘  └────────────┘  │
│         │ (MCP Protocol)                                  │
│  ┌──────┴─────────────────────────────────────────┐      │
│  │           실행 엔진 (Claude Code + ai-party)     │      │
│  │                                                │      │
│  │  SessionStart 훅 → MCP로 프로젝트 컨텍스트 로드  │      │
│  │  /party → 팀 구성 → 파이프라인 → findings → DB   │      │
│  └────────────────────────────────────────────────┘      │
│                                                          │
│  접속: 💻 웹 대시보드(REST)  │  🤖 Claude Code(MCP)  │  🔗 Webhook  │
└──────────────────────────────────────────────────────────┘
```

### 관계 정리

```
AI OPS Platform (별도 프로젝트)    ai-party (Claude Code 플러그인)
├── "무엇을 할지" 결정              ├── "어떻게 할지" 실행
├── 프로젝트/인증 관리              ├── 에이전트 정의 + 팀 프리셋
├── MCP Server (AI 통신)           ├── 파이프라인 상태 머신
├── REST API (브라우저/외부 전용)    ├── 3계층 강제 훅
├── 웹 대시보드 + Webhook           ├── 파일 핸드오프 (.party/)
├── 세션/이력/승인 DB              ├── 승인 게이트 (risk-based)
├── Claude Code 인스턴스 관리       └── MCP tools 호출 (approval 등)
└── 사용자 인터페이스
         │ MCP Protocol                      ▲
         └─── ai-party 플러그인을 설치한 ────┘
              Claude Code 인스턴스를 실행
```

### 모바일 시나리오

```
핸드폰에서 Claude.ai → "shopping_md NPE 수정해줘"
  → claude remote-control (로컬 PC)
  → AI OPS Platform → 프로젝트 정보 + 인증 자동 로드
  → ai-party 파이프라인 → 팀 구성 → 분석 → 설계 → 구현 → 리뷰
  → 승인 게이트 → Claude.ai 채팅 또는 웹 대시보드에서 승인/거절
```

### 보안 원칙

- 인증 정보는 플랫폼 DB에 암호화 저장 (AES-256 + 마스터 키)
- 에이전트에게는 필요한 최소 권한만 런타임에 주입
- secrets가 프롬프트나 findings에 노출되지 않도록 필터링

---

## Phase 4 진입 전 아키텍처 결정

> 이 섹션은 v0.9.0-rc.16 코드베이스 검토에서 도출된 Phase 4 차단 요소들이다.
> Step 16 시작 전에 아래 결정들이 확정되어야 한다.
> 관련: [migration-v09.md — Phase 4 진입 전 해결해야 할 구조적 갭](migration-v09.md#phase-4-진입-전-해결해야-할-구조적-갭)

### A. 세션 병렬 격리 전략 (→ Step 24 선행 설계)

**현재 문제**: 모든 훅이 `readSession()` → `.party/active-session.json` 단일 파일을 읽는다.
두 팀이 동시에 실행되면 active pointer를 서로 덮어쓴다.
`AI_PARTY_SESSION_ID` 환경 변수 경로가 있지만 Claude Code가 서브에이전트에게 per-session으로 주입하는 메커니즘이 없다.

**결정 필요**:
- **Option A**: `AI_PARTY_SESSION_ID` env를 Claude Code 인스턴스 시작 시 플랫폼이 주입 → 프로세스 수준 격리
- **Option B**: `active-session.json`을 세션 레지스트리(배열)로 교체 → 훅이 session_id로 조회
- **Option C**: Phase 4에서는 인스턴스 1개당 세션 1개 정책 유지 → Step 24(병렬)에서만 해결

현재 권장: **Option A** (플랫폼 인스턴스 매니저가 env 주입 — Step 17 구현 시 함께 처리)

### B. Approval 연동 메커니즘 (→ Step 18-A 선행 설계)

**현재 문제**: 승인 흐름이 Claude Code 채팅 입력(`approve <session_id> <request_id>`)에만 의존한다.
플랫폼이 결정 파일을 직접 써도 Claude Code 인스턴스가 재개 신호를 받을 방법이 없다 — HTTP polling이나 file watcher 없이는 `PENDING_APPROVAL`에서 유휴 대기 중인 인스턴스를 깨울 수 없다.

**결정**: Claude가 MCP `request_approval` 도구를 **blocking 호출**로 실행 → 플랫폼이 사용자 결정을 받아 응답 반환.

```
Claude (ai-party) ──MCP call──▶ request_approval(session_id, gate_type, summary, payload)
                                        │
                                플랫폼이 REST로 사람에게 알림
                                사람이 웹 대시보드에서 승인/거절
                                        │
Claude ◀──MCP response─────────── { decision: "approved"|"rejected", comment }
```

- **기본**: MCP `request_approval` blocking 호출 → 플랫폼이 사람 결정을 받아 응답
- **Fallback**: MCP 서버 미연결 시 `claude remote-control`로 "approve {session_id} {request_id}" 메시지 주입 → `UserPromptSubmit` 훅 처리 (로컬/CLI 환경)
- **효과**: `PENDING_APPROVAL` 유휴 대기 문제가 근본적으로 해소됨 — Claude가 MCP call을 열어두고 대기하므로 외부 polling/watcher 불필요

구현 위치: [Step 18-A: MCP Server](#step-18-a-mcp-server-claude-code--platform)

### C. SessionStart 훅 (→ Step 17 진입점)

**현재 문제**: `hooks.json`에 `SessionStart` 이벤트 없음. 플랫폼 DB에서 프로젝트 정보를 로드할 훅 진입점이 없다.

**해야 할 것**: Step 17 구현 시 `hooks.json`에 `SessionStart` 이벤트 추가:
```json
"SessionStart": [{
  "type": "command",
  "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs",
  "timeout": 10
}]
```
`session-start.mjs`: cwd 기반 프로젝트 감지 → 플랫폼 MCP `get_project_context` 호출 → `CLAUDE_PROJECT_ID` 등 env 주입

### D. Mode Resolver 위치 결정 (→ Step 17-A)

**결정 필요**: `single | party-light | party-full` 모드 결정 로직이 어디에 위치하는가?

- **Option A**: 플랫폼 서버 — 티켓 입력 시 risk_level/complexity 분석 → `/party`, `/party-team` 커맨드로 지시
- **Option B**: ai-party 플러그인 — `auto-delegate.mjs`에서 요청 분석 후 모드 자동 선택
- **Option C**: 하이브리드 — 플랫폼이 모드 힌트 제공 → 플러그인이 최종 결정

현재 권장: **Option A** (플랫폼이 "무엇을 할지" 결정하는 원칙과 일치)
플랫폼이 `POST /tickets`에서 모드를 결정하고 적절한 `/party` 커맨드로 Claude Code에 지시.

---

## Phase 4: AI OPS 플랫폼 MVP (별도 레포)

### Step 16: 프로젝트 레지스트리 + DB

- [ ] 별도 레포 생성 (ai-ops-platform)
- [ ] SQLite DB 스키마 설계
  - projects: id, name, repo_path, branch_strategy, tech_stack, conventions
  - credentials: id, project_id, type, encrypted_value, scope
  - tickets: id, project_id, title, request, risk_level, priority, status, created_at, completed_at
  - sessions: id, ticket_id, team, task, status, created_at, completed_at
  - findings: id, session_id, phase, content, created_at
  - ticket_events: id, ticket_id, session_id, type, payload_json, created_at
  - approval_requests: id, ticket_id, session_id, gate_type, risk_level, summary, payload_json, status, requested_at
  - approval_decisions: id, approval_request_id, decision, comment, decided_by, decided_at
  - ticket_comments: id, ticket_id, author, body, created_at
- [ ] 프로젝트 CRUD API
- [ ] 인증 정보 암호화 저장

### Step 17: Claude Code 인스턴스 관리

> SessionStart 훅 설계: [Phase 4 진입 전 아키텍처 결정 C](#c-sessionstart-훅--step-17-진입점)
> Approval 재개 메커니즘: [Phase 4 진입 전 아키텍처 결정 B](#b-approval-연동-메커니즘--step-18-a-선행-설계)

- [ ] `hooks/hooks.json`에 `SessionStart` 이벤트 추가 + `hooks/session-start.mjs` 구현
  - cwd 기반 프로젝트 감지 → 플랫폼 MCP Server에서 `project://context` 리소스로 프로젝트 컨텍스트 주입
- [ ] Claude Code 인스턴스 실행 매니저 + `AI_PARTY_SESSION_ID` env 주입 (세션 격리)
- [ ] .party/ 결과물 수집 → DB 저장
- [ ] 팀/에이전트 설정 외부화
- [ ] 런타임 정책 고정:
  - teammate mode 기본값 `in-process` (tmux/split-pane는 로컬 디버깅 전용)
  - `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 환경 표준화
  - ai-party 자동 위임은 기본 비활성(옵트인): 명시 커맨드(`/party`, `/ai-party:party`, `party`, `ai-party`, `팀모드`, `팀생성`)에서만 시작
  - phase-aware lazy spawn (leader + 현재 phase 멤버만 스폰, 다음 phase는 on-demand)
  - CONTEXTUALIZING는 경량 라우팅 단계로 제한 (리더 전수 분석 금지, 워커가 상세 분석 담당)
  - `context.md`는 필수 상세 리포트가 아니라 라우팅 인덱스(범위/핵심 파일/오픈 질문)로 운용
  - `context.md` 완성 대기로 전체 워커를 블로킹하지 않음 (현재 phase + immediate next phase 멤버 조기 배정 허용)
  - 승인 정책 모드: `approval_mode=platform` 기본, `cli`는 로컬 디버그 전용
  - risk-based gate: LOW 자동, MEDIUM/HIGH는 플랫폼 승인 후 진행
  - `PENDING_APPROVAL` 중에는 pending request id + session id를 사용자 입력 채널에 반복 노출하고 `approve <session_id> <request_id>`로 재개
  - `PENDING_APPROVAL` 중에는 승인/반려/수정 결정이 내려질 때까지 도구 실행을 엄격 차단 (예외: shutdown 정리 경로)
  - 승인 대기 중 동일 MEDIUM/HIGH 재시도는 신규 요청 생성 없이 기존 pending 요청으로 dedupe
  - TeamDelete는 파이프라인 정리용 LOW 위험군으로 분류 (종료 정리 차단 회귀 방지)
  - 스킬/도구 위임: 기본 허용 (단, phase/contract/approval 정책 위반 시 차단)
  - TaskCreate/TaskUpdate는 활성 세션의 `${RUNTIME_ROOT}/tickets/`로 기록

### Step 17-A: Mode Resolver (single | party-light | party-full)

> 아키텍처 결정: 플랫폼 서버에서 모드 결정 → `/party` 커맨드로 Claude Code 지시 (→ [Phase 4 진입 전 아키텍처 결정 D](#d-mode-resolver-위치-결정--step-17-a))

- [ ] 티켓 입력 시 모드 자동 결정기 추가
  - `single`: 저위험/저복잡도. 단일 에이전트 중심으로 빠르게 처리
  - `party-light`: 중간 복잡도. leader + 최소 워커 조합
  - `party-full`: 고위험/고복잡도. 전체 파이프라인 + 중간 승인 게이트
- [ ] 결정 기준 정의 (예: risk_level, blast radius, requested scope, SLA)
  - CONTEXTUALIZING 비용(예상 스캔 범위/파일 수/기존 context 재사용 가능성)을 입력 신호에 포함
- [ ] 단일 모드도 에이전트 기반으로 실행(작업 큐를 통해 동시 다중 티켓 처리)
- [ ] 모드 결정 결과를 `ticket_events`에 기록하고 대시보드에 노출

### Step 18-A: MCP Server (Claude Code ↔ Platform)

> 설계 결정: [Phase 4 진입 전 아키텍처 결정 B](#b-approval-연동-메커니즘--step-18-a-선행-설계)

- [ ] 기술 스택: Node.js MCP SDK (`@modelcontextprotocol/sdk`)
- [ ] MCP tools 구현
  - `get_project_context` — cwd 기반 프로젝트 정보 + 인증 정보 (secrets 제외) 반환
  - `create_ticket` — 플랫폼 DB에 티켓 생성 → ticket_id 반환
  - `request_approval` — 승인 요청 생성 + 사용자 결정을 blocking으로 대기하여 `{ decision, comment }` 반환
  - `get_session_status` — 현재 세션 상태 조회
- [ ] MCP resources 구현
  - `project://{project_id}/context` — 프로젝트 컨벤션, 브랜치 전략, 기술 스택 (읽기 전용)
- [ ] `hooks/hooks.json`에 플랫폼 MCP 서버 등록 (SessionStart 시 자동 활성화)
- [ ] REST Fallback: MCP 미연결 환경을 위한 `claude remote-control` 주입 경로 유지

### Step 18-B: REST API (브라우저 / 외부 전용)

- [ ] 기술 스택 선정 (Node.js/Fastify 또는 Python/FastAPI)
- [ ] REST API 엔드포인트 (브라우저 대시보드 + 모바일 + Webhook 전용)
  - `POST /tickets` — 사용자 요청 티켓 생성 (Jira 유사 진입점)
  - `GET /tickets/:id` — 티켓 상세 (상태, 단계, 담당 에이전트, 산출물)
  - `GET /tickets/:id/events` — 파이프라인 이벤트 타임라인
  - `POST /tickets/:id/comments` — 의견/질문/요청 전달
  - `POST /approval-requests/:id/approve` — 승인 (MCP blocking call 응답과 동기화)
  - `POST /approval-requests/:id/reject` — 거절 + 사유
  - `POST /approval-requests/:id/revise` — 수정 요구 + 코멘트
- [ ] approval 결정은 MCP `request_approval` 응답과 동일 결정 파일 공유 (동기화 필수)

---

## Phase 5: 웹 대시보드 + 승인 워크플로우

> ai-party의 tickets 연동은 세션별 runtime_root 기준으로 운용.
> → [phase3.md](phase3.md) Step 12 참조

### Step 19: 웹 대시보드 (읽기)

- [ ] 프론트엔드 기술 스택 선정
- [ ] 화면: 프로젝트 목록, 티켓 보드(Backlog/In Progress/Pending Approval/Done), 활성 세션
- [ ] 티켓 상세: 단계별 진행, findings/PR/실행 명령, 에이전트 메시지, 의견 스레드
- [ ] 실시간 업데이트 (WebSocket/SSE)

### Step 20: 승인 게이트 UI

- [ ] `PENDING_APPROVAL`(중간) / `AWAITING_APPROVAL`(최종) 모두 웹 알림
- [ ] 승인 화면: 제안 방향(무엇/왜/영향/리스크) + git diff/findings/명령 + 롤백 플랜
- [ ] 승인 이력 관리
- [ ] 승인/거절 시 코멘트 필수화, 티켓 타임라인에 즉시 반영

### Step 21: 이력 + 분석

- [ ] 팀별/프로젝트별 성공률, 평균 소요 시간
- [ ] 에이전트별 성능 비교
- [ ] 토큰 비용 분석
- [ ] 승인 지표: 승인 대기 시간, 승인율/거절율, 재작업률
- [ ] 추세 그래프

### Phase 5에서 활성화할 ai-party 기능

- [ ] **tickets.mjs PostToolUse 동기화**: Leader TaskCreate/TaskUpdate → `${RUNTIME_ROOT}/tickets/` 자동 생성
- [ ] **`/party-board` 칸반**: tickets 연동 후 터미널 칸반 활성화
- [ ] **events.ndjson → 대시보드 연동**: 이벤트 스트림 → MCP notification + REST WebSocket 브릿지 (Claude Code는 MCP로 emit, 브라우저는 REST/SSE로 구독)
- [ ] **approval_requested 이벤트 브릿지**: 고위험 도구 실행 전 플랫폼 승인 대기 전환

---

## Phase 6: 프로덕션 + 확장

### Step 22: 멀티 유저 + 접근 제어

- [ ] 사용자 인증 (OAuth 또는 기본 인증)
- [ ] 프로젝트별 권한 관리
- [ ] 감사 로그

### Step 23: 자동 트리거

- [ ] GitHub Webhook (Issue → 자동 팀 구성)
- [ ] 스케줄 기반 실행 (cron)
- [ ] 모니터링 알림 연동 (에러 → 자동 bugfix 소집)
- [ ] 모니터링 이벤트 → 자동 티켓 등록 → Mode Resolver로 실행 모드 자동 선택

### Step 24: 동시 실행 + 스케일링

> v0.9.0-rc.13부터 `.party/sessions/<session-id>/` + `active-session.json` 기반의 세션 저장소 분리가 시작됐다.
> 다만 findings/tickets 실행 아티팩트는 아직 활성 세션 중심이므로 완전 병렬 실행은 이 Phase에서 마무리한다.

**선행 결정 필요**: 세션 병렬 격리 전략 (→ [Phase 4 진입 전 아키텍처 결정 A](#a-세션-병렬-격리-전략--step-24-선행-설계))

현재 블로커:
- `active-session.json` 단일 포인터: 모든 훅이 단일 전역 파일을 읽어 병렬 실행 시 충돌
- `lib/session.mjs`의 `isSessionStale` 4시간 하드코딩: 장기 파이프라인(migration/security) 대응 필요
- `session.task_ticket_map` read-modify-write 비원자적: 멀티 워커 동시 완료 시 map 엔트리 유실 가능

- [ ] 세션 격리 전략 확정 및 구현 (active-session.json 단일 포인터 제거 또는 env 주입 방식 결정)
- [ ] `isSessionStale` 타임아웃 설정화 (`session.json` `max_age_ms` 필드 또는 플랫폼 환경 변수)
- [ ] `task_ticket_map` 업데이트 원자화 (별도 파일 또는 CAS 방식)
- [ ] 여러 프로젝트 요청 병렬 처리
- [ ] 리소스 관리 (동시 에이전트 수 제한)
- [ ] 큐 시스템 (우선순위 기반)
- [ ] findings/tickets까지 세션별 완전 격리 (서브디렉토리 or 별도 worktree)

### Step 25: 추가 팀 프리셋 + 커스터마이징

- [ ] security, planning, migration 등 추가 팀
- [ ] 동적 팀 구성 고도화
- [ ] 사용자 정의 팀 프리셋 (대시보드에서 생성)
- [ ] 알림 연동 (카카오워크/슬랙)
