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
└── 사용자 인터페이스              └── 승인 게이트 (CLI)
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
  - sessions: id, project_id, team, task, status, created_at, completed_at
  - findings: id, session_id, phase, content, created_at
  - approvals: id, session_id, summary, status, decided_at
- [ ] 프로젝트 CRUD API
- [ ] 인증 정보 암호화 저장

### Step 17: Claude Code 인스턴스 관리

- [ ] SessionStart 훅 → cwd 기반 프로젝트 자동 감지 → DB 정보 로드
- [ ] Claude Code 인스턴스 실행 매니저
- [ ] .party/ 결과물 수집 → DB 저장
- [ ] 팀/에이전트 설정 외부화

### Step 18: API 서버

- [ ] 기술 스택 선정 (Node.js/Fastify 또는 Python/FastAPI)
- [ ] REST API 엔드포인트
- [ ] claude remote-control 연동

---

## Phase 5: 웹 대시보드 + 승인 워크플로우

> ai-party의 tickets.mjs 미러링 연동도 이 Phase에서 활성화.
> → [phase3.md](phase3.md) Step 12 참조

### Step 19: 웹 대시보드 (읽기)

- [ ] 프론트엔드 기술 스택 선정
- [ ] 화면: 프로젝트 목록, 활성 세션, findings 뷰어, 에이전트 상태
- [ ] 실시간 업데이트 (WebSocket/SSE)

### Step 20: 승인 게이트 UI

- [ ] AWAITING_APPROVAL → 웹 알림
- [ ] 승인 화면: git diff + findings + approve/reject/revise
- [ ] 승인 이력 관리

### Step 21: 이력 + 분석

- [ ] 팀별/프로젝트별 성공률, 평균 소요 시간
- [ ] 에이전트별 성능 비교
- [ ] 토큰 비용 분석
- [ ] 추세 그래프

### Phase 5에서 활성화할 ai-party 기능

- [ ] **tickets.mjs PostToolUse 미러링**: Leader TaskCreate → `.party/tickets/` 자동 생성
- [ ] **`/party-board` 칸반**: tickets 연동 후 터미널 칸반 활성화
- [ ] **events.ndjson → 대시보드 연동**: 이벤트 스트림 → WebSocket 브릿지

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
