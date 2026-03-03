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
│  ┌───────────────────────┼────────────────────────┐      │
│  │              API 서버 (REST)                     │      │
│  │  POST /tasks — 작업 요청                        │      │
│  │  GET /tasks/:id — 상태 조회                     │      │
│  │  POST /tasks/:id/approve — 승인                 │      │
│  │  CRUD /projects — 프로젝트 관리                  │      │
│  └───────────────────────┬────────────────────────┘      │
│                          │                               │
│  ┌───────────────────────┼────────────────────────┐      │
│  │           실행 엔진 (Claude Code + ai-party)     │      │
│  │                                                │      │
│  │  SessionStart 훅 → DB에서 프로젝트 정보 자동 로드  │      │
│  │  /party → 팀 구성 → 파이프라인 → findings → DB    │      │
│  └────────────────────────────────────────────────┘      │
│                                                          │
│  접속:  💻 웹 대시보드  │  📱 claude remote-control  │  🔗 Webhook  │
└──────────────────────────────────────────────────────────┘
```

### 관계 정리

```
AI OPS Platform (별도 프로젝트)    ai-party (Claude Code 플러그인)
├── "무엇을 할지" 결정              ├── "어떻게 할지" 실행
├── 프로젝트/인증 관리              ├── 에이전트 정의 + 팀 프리셋
├── 웹 대시보드 + API              ├── 파이프라인 상태 머신
├── 세션/이력/승인 DB              ├── 3계층 강제 훅
├── Claude Code 인스턴스 관리       ├── 파일 핸드오프 (.party/)
└── 사용자 인터페이스              └── 승인 게이트 (risk-based)
         │                                  ▲
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

- [ ] SessionStart 훅 → cwd 기반 프로젝트 자동 감지 → DB 정보 로드
- [ ] Claude Code 인스턴스 실행 매니저
- [ ] .party/ 결과물 수집 → DB 저장
- [ ] 팀/에이전트 설정 외부화
- [ ] 런타임 정책 고정:
  - teammate mode 기본값 `in-process` (tmux/split-pane는 로컬 디버깅 전용)
  - `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 환경 표준화
  - ai-party 자동 위임은 기본 비활성(옵트인): 명시 커맨드(`/party`, `party`, `ai-party`, `팀모드`, `팀생성`)에서만 시작
  - phase-aware lazy spawn (leader + 현재 phase 멤버만 스폰, 다음 phase는 on-demand)
  - CONTEXTUALIZING는 경량 라우팅 단계로 제한 (리더 전수 분석 금지, 워커가 상세 분석 담당)
  - `context.md`는 필수 상세 리포트가 아니라 라우팅 인덱스(범위/핵심 파일/오픈 질문)로 운용
  - `context.md` 완성 대기로 전체 워커를 블로킹하지 않음 (현재 phase + immediate next phase 멤버 조기 배정 허용)
  - 승인 정책 모드: `approval_mode=platform` 기본, `cli`는 로컬 디버그 전용
  - risk-based gate: LOW 자동, MEDIUM/HIGH는 플랫폼 승인 후 진행
  - TeamDelete는 파이프라인 정리용 LOW 위험군으로 분류 (종료 정리 차단 회귀 방지)
  - 스킬/도구 위임: 기본 허용 (단, phase/contract/approval 정책 위반 시 차단)

### Step 17-A: Mode Resolver (single | party-light | party-full)

- [ ] 티켓 입력 시 모드 자동 결정기 추가
  - `single`: 저위험/저복잡도. 단일 에이전트 중심으로 빠르게 처리
  - `party-light`: 중간 복잡도. leader + 최소 워커 조합
  - `party-full`: 고위험/고복잡도. 전체 파이프라인 + 중간 승인 게이트
- [ ] 결정 기준 정의 (예: risk_level, blast radius, requested scope, SLA)
  - CONTEXTUALIZING 비용(예상 스캔 범위/파일 수/기존 context 재사용 가능성)을 입력 신호에 포함
- [ ] 단일 모드도 에이전트 기반으로 실행(작업 큐를 통해 동시 다중 티켓 처리)
- [ ] 모드 결정 결과를 `ticket_events`에 기록하고 대시보드에 노출

### Step 18: API 서버

- [ ] 기술 스택 선정 (Node.js/Fastify 또는 Python/FastAPI)
- [ ] REST API 엔드포인트
  - `POST /tickets` — 사용자 요청 티켓 생성 (Jira 유사 진입점)
  - `GET /tickets/:id` — 티켓 상세 (상태, 단계, 담당 에이전트, 산출물)
  - `GET /tickets/:id/events` — 파이프라인 이벤트 타임라인
  - `POST /tickets/:id/comments` — 의견/질문/요청 전달
  - `POST /approval-requests/:id/approve` — 승인
  - `POST /approval-requests/:id/reject` — 거절 + 사유
  - `POST /approval-requests/:id/revise` — 수정 요구 + 코멘트
- [ ] claude remote-control 연동

---

## Phase 5: 웹 대시보드 + 승인 워크플로우

> ai-party의 tickets.mjs 미러링 연동도 이 Phase에서 활성화.
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

- [ ] **tickets.mjs PostToolUse 미러링**: Leader TaskCreate → `.party/tickets/` 자동 생성
- [ ] **`/party-board` 칸반**: tickets 연동 후 터미널 칸반 활성화
- [ ] **events.ndjson → 대시보드 연동**: 이벤트 스트림 → WebSocket 브릿지
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

> 현재 `.party/`는 단일 세션. 동시 다중 요청은 이 Phase에서 해결.

- [ ] 여러 프로젝트 요청 병렬 처리
- [ ] 리소스 관리 (동시 에이전트 수 제한)
- [ ] 큐 시스템 (우선순위 기반)
- [ ] `.party/` 세션별 격리 (서브디렉토리 or 별도 worktree)

### Step 25: 추가 팀 프리셋 + 커스터마이징

- [ ] security, planning, migration 등 추가 팀
- [ ] 동적 팀 구성 고도화
- [ ] 사용자 정의 팀 프리셋 (대시보드에서 생성)
- [ ] 알림 연동 (카카오워크/슬랙)
