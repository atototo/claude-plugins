# AI Party Plugin 설계 문서

> 다양한 AI 에이전트(Claude, Gemini, Codex)가 파티 모드로 협업하는 플러그인
> 문제에 따라 자율적으로 팀을 구성하고, 분석 → 설계 → 구현 → 리뷰를 수행
> 모든 최종 액션은 사용자 승인 게이트를 거침

---

## 목차

1. [비전과 목표](#1-비전과-목표)
2. [아키텍처 개요](#2-아키텍처-개요)
3. [레이어 구조](#3-레이어-구조)
4. [Layer 1: AI 에이전트 상세](#4-layer-1-ai-에이전트-상세)
5. [Layer 2: 팀 프리셋 상세](#5-layer-2-팀-프리셋-상세)
6. [Layer 3: 오케스트레이션 엔진](#6-layer-3-오케스트레이션-엔진)
7. [파티 모드 통신 프로토콜](#7-파티-모드-통신-프로토콜)
8. [승인 게이트 설계](#8-승인-게이트-설계)
9. [디렉토리 구조](#9-디렉토리-구조)
10. [에이전트 파일 상세 스펙](#10-에이전트-파일-상세-스펙)
11. [팀 프리셋 상세 스펙](#11-팀-프리셋-상세-스펙)
12. [커맨드 설계](#12-커맨드-설계)
13. [multi-delegate 재활용 전략](#13-multi-delegate-재활용-전략)
14. [사전 요구사항](#14-사전-요구사항)
15. [구현 순서 및 체크리스트](#15-구현-순서-및-체크리스트)
16. [전체 아키텍처 — AI OPS 플랫폼](#16-전체-아키텍처--ai-ops-플랫폼)
17. [OMC 채택 패턴](#17-omcoh-my-claudecode-채택-패턴)
18. [로드맵 타임라인](#18-로드맵-타임라인)

---

## 1. 비전과 목표

### 궁극적 비전

AI 에이전트들이 **파티 모드**로 자율 협업하되, 모든 결정권은 사람에게 있는 구조.
이슈가 발생하면 AI들이 파이프라인 단계별로 분석하고, 계획 세우고, 구현하고,
리뷰까지 마친 후 사람에게 승인을 요청한다.

### 핵심 원칙

- **AI 유닛 기반**: PL/Architect 같은 역할이 아닌, Claude/Gemini/Codex 각 AI의 **강점**을 정의
- **팀 조합 프리셋**: 문제 유형에 따라 AI 유닛들의 조합(팀)을 미리 정의하되, 동적 구성도 가능
- **파티 모드**: Agent Teams를 활용하여 **파일 기반 핸드오프** + 시그널 메시징으로 단계별 협업
- **승인 게이트**: 코드 변경, PR 생성, 배포 등 실제 액션은 반드시 사용자 승인 후 실행
- **점진적 확장**: CLI 동작 → 알림 통합 → 대시보드 UI 순서로 발전

### 설계 목표

```
문제에 따라 AI들이 자율적으로 모여서:
  1. 파이프라인 단계별로 분석 → 설계 → 구현 → 리뷰
  2. 각 단계 결과를 findings 파일로 핸드오프
  3. 리뷰 에이전트가 구현 결과를 검수
  4. 최종 결과를 사람에게 보고 → 승인 대기
```

### 궁극적 목표 — AI OPS 플랫폼

```
ai-party 플러그인은 "실행 엔진"으로, 별도 AI OPS 플랫폼의 핵심 컴포넌트가 된다.

AI OPS Platform (별도 프로젝트)
  ├── DB에서 프로젝트 정보 로드 (레포, 브랜치 전략, 컨벤션, 환경, 인증)
  ├── 요청 단위로 팀 자동 구성 (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 필수)
  ├── 파이프라인 실행 → findings 수집 → 승인 게이트
  ├── 웹 대시보드 (모니터링, 승인, 이력, 통계)
  ├── 모바일 접근 (claude remote-control)
  └── 보안 관리 (인증 정보 암호화, 최소 권한 원칙)

개발자는 프로젝트를 등록하고 작업을 요청하기만 하면 됨.
AI가 팀을 구성해서 일하고, 사람이 승인하면 실행.
```

---

## 2. 아키텍처 개요

### 전체 흐름

```
트리거 (수동 커맨드 / 이슈 감지 / 알림)
    │
    ▼
┌─────────────────────────────────────────┐
│  Host (Claude Code 세션) = Lead          │
│  - 문제 유형 판단                        │
│  - 팀 프리셋 선택 or 동적 구성            │
│  - Agent Teams 세션 생성                 │
│  - 오케스트레이션 전담 (직접 작업 안 함)   │
└──────────┬──────────────────────────────┘
           │ 스폰
    ┌──────┼──────┐
    ▼      ▼      ▼
┌──────┐┌──────┐┌──────┐
│Claude││Gemini││Codex │
│opus  ││sonnet││sonnet│  ← 각자 독립 컨텍스트
│설계  ││+CLI  ││+CLI  │  ← 파일 핸드오프 + 시그널
│리뷰  ││분석  ││구현  │
└──┬───┘└──┬───┘└──┬───┘-
   │       │       │
   └───────┼───────┘
           │
    ┌──────┴──────┐
    │  파티 모드    │
    │  - 핸드오프   │
    │  - 태스크 분배 │
    │  - 단계별 리뷰 │
    └──────┬──────┘
           │
           ▼
    Host(Lead)가 결과 종합
           │
           ▼
┌─────────────────────┐
│  승인 게이트          │
│  - 변경 사항 요약     │
│  - diff / PR 링크    │
│  - ✅ 승인 / ❌ 거절  │
└──────────┬──────────┘
           │
           ▼
      사용자 확인 후 실행
```

### 파티 모드 예시

```
[이슈: reservation-deploy NPE 발생]

Host(Lead): "NPE 이슈 감지. bugfix 팀 소집. 3명 스폰"

  gemini-agent(analyst) → claude-agent(architect):
    "로그 분석 결과 ReportServiceImpl.initialize()에서
     Map.of()에 null 전달. ERROR 5건, NPE 2건"

  claude-agent(architect) → codex-agent(builder):
    "Map.of() → HashMap 교체 + null guard 방식으로 가자.
     Collections.unmodifiableMap()으로 불변성 유지 필수"

  codex-agent(builder) → gemini-agent(analyst):
    "기존 브랜치에 수정 커밋 있다는데, 확인해줘"

  gemini-agent(analyst) → codex-agent(builder):
    "feature/reservation_bugfix_20260225 커밋 f7fc507에
     이미 적용됨. main 머지 안 된 상태"

  codex-agent(builder) → claude-agent(reviewer):
    "해당 커밋 기반으로 코드 수정 + 테스트 추가 완료. 리뷰 부탁"

  claude-agent(reviewer) → codex-agent(builder):
    "LGTM. 단, meetingRoomCapacity null 케이스 테스트 추가해"

  codex-agent(builder) → claude-agent(reviewer):
    "테스트 추가함"

  claude-agent(reviewer) → Host(Lead):
    "리뷰 완료. PASS"

Host(Lead) → Young: "[승인 요청]
  PR: fix: ReportServiceImpl NPE - Map.of() null 방어
  분석(Gemini) → 설계(Claude) → 구현(Codex) → 리뷰(Claude) 완료
  ✅ 승인 / ❌ 거절"
```

---

## 3. 레이어 구조

```
┌─────────────────────────────────────────────┐
│          Layer 3: 오케스트레이션 엔진          │
│  Host(Lead): 팀 선택 → Agent Teams 세션 관리  │
│  승인 게이트, 결과 종합                       │
├─────────────────────────────────────────────┤
│          Layer 2: 팀 프리셋                   │
│  teams/bugfix.md, teams/devops.md, ...        │
│  AI 에이전트 조합 + 역할 + 워크플로우 정의     │
├─────────────────────────────────────────────┤
│          Layer 1: AI 에이전트 유닛             │
│  agents/claude-agent.md  (opus)              │
│  agents/gemini-agent.md  (sonnet + CLI)      │
│  agents/codex-agent.md   (sonnet + CLI)      │
│  ※ Host = Lead, 에이전트가 아닌 세션 자체      │
├─────────────────────────────────────────────┤
│          Layer 0: 실행 도구 (기존 재활용)       │
│  scripts/codex_exec.sh                       │
│  scripts/gemini_exec.sh                      │
│  hooks/post-delegate-verify.mjs              │
└─────────────────────────────────────────────┘
```

---

## 4. Layer 1: AI 에이전트 상세

### 설계 철학

**Host(Claude Code 세션) = Lead/오케스트레이터**로, 팀 소집과 승인 게이트만 담당.
실제 작업은 독립 컨텍스트의 에이전트들이 수행하며, findings 파일 핸드오프로 정보를 전달한다.
역할(PL, Architect, Builder)이 아닌 **AI 모델의 강점**으로 에이전트를 정의한다.

### 4.0 Host (Lead) — Claude Code 세션 자체

```
역할: 오케스트레이터 전담
  - 요청/이슈 접수 및 분석
  - 팀 프리셋 선택 or 동적 구성
  - Agent Teams 세션 생성 및 팀원 스폰
  - 승인 게이트 관리 (결과 종합 → 사용자에게 보고)
  - 교착 상태 해소 및 에스컬레이션

모델: 사용자 세션 설정에 따름
특성:
  - 에이전트가 아닌 호스트 세션 그 자체
  - 오케스트레이션에 집중하여 컨텍스트를 깨끗하게 유지
  - 직접 코드 수정/분석하지 않음 (에이전트에게 위임)
```

### 4.1 Claude Agent (model: opus)

```
강점: 깊은 추론, 설계, 판단, 코드 리뷰, 보안 분석
모델: opus (복잡한 추론에 최적)

수행 가능한 역할:
  - Architect: 영향 범위 파악, 설계 방향 제시, 기술 의사결정
  - Reviewer: 코드 품질/보안/컨벤션 검수
  - Security Auditor: 보안 취약점 분석
  - PL: 복잡한 업무 분해, 우선순위 판단 (Lead 대신 전문 판단 시)

도구: Read, Write, Edit, Bash, Grep, Glob (Claude Code 네이티브 전체)

특성:
  - 독립 컨텍스트 윈도우에서 깊이 있는 추론 수행
  - 다른 에이전트 결과물(findings)을 읽고 다음 단계에 반영
  - opus 모델로 고품질 판단 보장
```

### 4.2 Gemini Agent (model: sonnet)

```
강점: 대용량 분석, 긴 컨텍스트, 문서 생성, 데이터 기반 판단
모델: sonnet (실제 분석은 Gemini CLI가 처리, sonnet은 결과 해석 + 메시징)

수행 가능한 역할:
  - Analyst: 로그/메트릭/소스 분석, 근본 원인 파악
  - Data Analyst: 비용/성능 데이터 분석
  - Doc Writer: 문서/보고서 생성
  - Scanner: 대규모 코드베이스 스캔

도구: Read, Bash, Grep, Glob (gemini_exec.sh 경유)
외부 CLI: gemini -p "<task>" --output-format json -y

특성:
  - 무거운 분석은 Gemini CLI에 위임
  - sonnet 세션은 CLI 결과 해석 + 다른 에이전트와 메시징 담당
  - stdin 파이프로 파일 컨텍스트 전달, thread resume 없음
```

### 4.3 Codex Agent (model: sonnet)

```
강점: 코드 생성/수정, 테스트 작성, sandbox 내 실행
모델: sonnet (실제 구현은 Codex CLI가 처리, sonnet은 결과 해석 + 메시징)

수행 가능한 역할:
  - Builder: 코드 작성/수정, PR 생성
  - Fixer: 버그 수정, 패치 적용
  - Test Writer: 테스트 코드 작성
  - Config Generator: 설정 파일 생성

도구: Read, Write, Edit, Bash, Grep, Glob (codex_exec.sh 경유)
외부 CLI: codex exec --json --full-auto "<task>"

특성:
  - 무거운 코드 생성은 Codex CLI에 위임
  - sonnet 세션은 CLI 결과 해석 + 다른 에이전트와 메시징 담당
  - thread resume 가능, sandbox 내 파일 직접 수정
```

### 4.4 에이전트 구조 요약

```
Host (Claude Code 세션) ─── Lead / 오케스트레이터
  │  모델: 사용자 설정
  │  역할: 팀 소집, 태스크 분배, 승인 게이트
  │
  ├─→ claude-agent.md ─── 추론/설계/리뷰 전문
  │     모델: opus
  │     독립 컨텍스트, 핸드오프 협업
  │
  ├─→ gemini-agent.md ─── 분석/문서 전문
  │     모델: sonnet + Gemini CLI
  │     독립 컨텍스트, 핸드오프 협업
  │
  └─→ codex-agent.md ─── 구현/수정 전문
        모델: sonnet + Codex CLI
        독립 컨텍스트, 핸드오프 협업
```

### 4.5 에이전트 확장성

새로운 AI가 나오면 `agents/` 에 `.md` 파일 하나 추가하면 됨:

```
agents/
  ├─ claude-agent.md          ← opus, 추론/설계/리뷰
  ├─ gemini-agent.md          ← sonnet + Gemini CLI
  ├─ codex-agent.md           ← sonnet + Codex CLI
  ├─ deepseek-agent.md        ← 새 AI 추가 (미래)
  └─ qwen-agent.md            ← 로컬 LLM도 가능 (미래)
```

---

## 5. Layer 2: 팀 프리셋 상세

### 설계 철학

팀 프리셋 = AI 에이전트 조합 + 역할 배정 + 워크플로우 정의.
같은 에이전트가 팀에 따라 다른 역할로 참여한다.

### 5.1 팀 목록 (구현 완료)

파일 형식: Markdown + YAML frontmatter (`teams/*.md`)

| 팀 | 파일 | 트리거 | 구성 | 용도 |
|---|------|--------|------|------|
| **bugfix** | `teams/bugfix.md` | error, exception, NPE, bug, 에러, 버그, 장애 | Gemini(분석) + Claude(설계/리뷰) + Codex(수정) | 버그 분석 → 수정 → PR |
| **devops** | `teams/devops.md` | k8s, resource, deploy, helm, 리소스, 배포 | Gemini(메트릭분석) + Claude(전략) + Codex(설정수정) | 인프라 최적화, 배포 |
| **dev-backend** | `teams/dev-backend.md` | api, endpoint, service, controller, backend | Claude(설계) + Codex(구현) + Claude(리뷰) | 백엔드 기능 개발 |
| **dev-frontend** | `teams/dev-frontend.md` | component, UI, 컴포넌트, 페이지, responsive, frontend | Claude(설계) + Codex(구현) + Gemini(기존분석) | 프론트엔드 개발 |

> 추가 팀 (security, planning, migration 등)은 Phase 6에서 구현 예정.

### 5.2 팀 자동 선택 기준

```
이슈/요청 분석 → teams/*.md의 trigger_keywords YAML frontmatter 매칭
  │
  ├─ error/exception/NPE/bug 키워드? → bugfix 팀
  ├─ k8s/resource/deploy/helm 키워드? → devops 팀
  ├─ api/endpoint/service/controller 키워드? → dev-backend 팀
  ├─ component/UI/responsive/frontend 키워드? → dev-frontend 팀
  │
  └─ 매칭 없음? → Claude가 문제 분석 후 동적 팀 구성
```

### 5.3 동적 팀 구성

프리셋에 없는 문제의 경우, Lead(Claude)가 자율적으로 팀을 구성:

```
Young: "이 프로젝트의 전체 API를 분석해서 문서화하고,
        비효율적인 엔드포인트를 찾아서 개선안을 제시해"

Lead(Claude): "복합 작업이네요. 동적 팀 구성합니다:
  - Gemini → API 전체 스캔 + 문서 생성
  - Claude → 비효율 패턴 분석 + 개선안 설계
  - Codex → 개선 코드 프로토타입

3개 에이전트 파티 시작합니다."
```

---

## 6. Layer 3: 오케스트레이션 엔진

### 6.1 오케스트레이터 역할

```
오케스트레이터 = Host (Claude Code 세션 자체, 에이전트가 아님)

책임:
  1. 요청/이슈 접수 및 분석
  2. 적절한 팀 프리셋 선택 (or 동적 구성)
  3. Agent Teams 세션 생성 및 팀원 스폰
  4. 워크플로우 단계 관리 (분석 → 설계 → 구현 → 리뷰)
  5. 팀원 간 교착 상태 해소
  6. 최종 결과 종합 및 사용자에게 보고
  7. 승인 게이트 관리

특성:
  - 직접 코드 수정/분석하지 않음 (에이전트에게 위임)
  - 오케스트레이션에 집중하여 컨텍스트를 깨끗하게 유지
  - 사용자와의 인터페이스 담당 (승인 요청/결과 보고)
```

### 6.2 워크플로우 상태 머신

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
  │      EXECUTING  ROLLED_BACK  │
  │          │                   │
  │          ▼                   │
  │       DONE                   │
  │                              │
  └──────────────────────────────┘
```

### 6.3 단계별 에이전트 활동

> 정보 전달은 **파일 기반 핸드오프** (.party/findings/*.md). SendMessage는 단계 완료 시그널용.

```
[ANALYZING 단계]
  - Gemini: 로그/데이터/소스 분석 → findings/analysis.md 작성
  - Claude: 1차 가설 수립 (병렬 가능)
  - 정보 공유: findings/analysis.md에 결과 저장

[PLANNING 단계]
  - Claude: findings/analysis.md를 읽고 해결 전략 수립 → findings/design.md 작성
  - blockedBy: ANALYZING 완료 필요

[EXECUTING 단계]
  - Codex: findings/design.md를 읽고 코드 생성/수정 → findings/implementation.md 작성
  - blockedBy: PLANNING 완료 필요

[REVIEWING 단계]
  - Claude: git diff + findings/design.md 대조 → findings/review.md 작성
  - blockedBy: EXECUTING 완료 필요

[AWAITING_APPROVAL 단계]
  - Lead: findings/*.md 수집 + git diff → 사용자에게 요약 제시
  - 사용자: 승인 / 거절 / 수정 요청
```

---

## 7. 통신 프로토콜 — 구조화된 핸드오프

### 7.1 핵심 원칙

에이전트 간 "토론"이 아닌 **파일 기반 핸드오프 + 시그널용 메시징**:

```
활성화 (필수): CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

통신 채널 2개:
  1. .party/findings/*.md — 정보 전달 (결과물, 분석, 설계)
  2. SendMessage — 시그널 ("분석 완료, 다음 단계 시작 가능")

태스크 관리:
  - TaskCreate(blockedBy) — 단계 의존성 강제
  - TaskUpdate(status) — 진행 상태 업데이트
  - TaskList — Lead가 모니터링

팀 리더(Lead = Host):
  - 팀원 스폰 및 태스크 할당
  - TaskList로 진행 상황 모니터링
  - 교착 상태 해소 (일정 시간 무응답 시 에스컬레이션)
  - 최종 결과 종합 및 승인 게이트 관리
```

### 7.2 핸드오프 흐름

```
[analyst] → findings/analysis.md 작성 → SendMessage("분석 완료") → Lead가 감지
                                                                    ↓
[architect] ← Lead가 TaskUpdate → findings/analysis.md 읽기 → findings/design.md 작성
                                                                    ↓
[builder] ← Lead가 TaskUpdate → findings/design.md 읽기 → 코드 수정 + findings/implementation.md
                                                                    ↓
[reviewer] ← Lead가 TaskUpdate → git diff + design.md 대조 → findings/review.md
                                                                    ↓
[Lead] → findings/*.md 전부 수집 → 승인 게이트 → 사용자에게 제시
```

### 7.3 상태 공유 디렉토리

```
프로젝트루트/
└── .party/                       # .gitignore에 제외됨
    ├── session.json              # 세션 메타데이터 (팀, 상태, 멤버, 실행 통계)
    ├── findings/                 # 단계별 결과물 (핸드오프 핵심)
    │   ├── analysis.md           # Gemini 분석 결과
    │   ├── design.md             # Claude 설계 결과
    │   ├── implementation.md     # Codex 구현 결과
    │   └── review.md             # Claude 리뷰 결과
    ├── approvals/                # 승인 요청 기록
    │   └── {timestamp}.json      # 승인 요청
    └── history.jsonl             # 세션 이벤트 로그 (append-only)
```

---

## 8. 승인 게이트 설계

### 8.1 승인 필요 액션

| 액션 | 승인 레벨 | 설명 |
|------|-----------|------|
| 코드 수정 | **필수** | git diff 요약 + 변경 파일 목록 |
| PR 생성 | **필수** | PR 제목, 본문, 브랜치 정보 |
| kubectl 실행 | **필수** | 실행 명령 + 롤백 명령 |
| helm 변경 | **필수** | values diff + 영향 범위 |
| 분석 결과 보고 | 자동 | 파이프라인 결과 요약만 표시 |
| 설계 방향 제시 | 자동 | 설계 방향 보고만 |

### 8.2 승인 요청 포맷

```
════════════════════════════════════════
🎉 PARTY RESULT — bugfix 팀
════════════════════════════════════════

📋 이슈: reservation-deploy NPE (ERROR x5, NPE x2)

🔍 분석 (Gemini):
  ReportServiceImpl.initialize():39에서 Map.of()에 null 전달
  
🏗️ 설계 (Claude):
  Map.of() → HashMap 교체 + null guard + 불변성 유지

🔧 구현 (Codex):
  - ReportServiceImpl.java:39 수정
  - ReportServiceImplTest.java 테스트 추가

✅ 리뷰 (Claude): LGTM
  - 보안: 이슈 없음
  - 컨벤션: 일치
  - 테스트: 커버리지 충분

📝 PR: fix: [reservation] ReportServiceImpl NPE 수정
   브랜치: feature/reservation_bugfix_20260225

════════════════════════════════════════
  ✅ 승인    ❌ 거절    📝 수정 요청
════════════════════════════════════════
```

### 8.3 승인 처리 흐름

```
승인 요청 생성
  │
  ├─ CLI 모드: 터미널에 요약 출력, 사용자 입력 대기
  │   > approve / reject / revise "수정 내용"
  │
  ├─ 알림 모드 (향후): 카카오워크/슬랙 메시지로 전달
  │   버튼 클릭으로 승인/거절
  │
  └─ 대시보드 모드 (최종): 웹 UI에서 카드 형태로 표시
      승인/거절 버튼 + 상세 정보 펼쳐보기
```

---

## 9. 디렉토리 구조

```
plugins/ai-party/
├── .claude-plugin/
│   └── plugin.json                    # 플러그인 매니페스트
│
├── agents/                            # Layer 1: AI 에이전트 유닛
│   ├── claude-agent.md                # Claude 네이티브 에이전트
│   ├── gemini-agent.md                # Gemini 활용 에이전트
│   └── codex-agent.md                 # Codex 활용 에이전트
│
├── teams/                             # Layer 2: 팀 프리셋 (Markdown + YAML frontmatter)
│   ├── bugfix.md                      # 버그 수정 팀
│   ├── devops.md                      # 인프라/배포 팀
│   ├── dev-backend.md                 # 백엔드 개발 팀
│   └── dev-frontend.md                # 프론트엔드 개발 팀
│
├── commands/                          # Layer 3: 슬래시 커맨드
│   ├── party.md                       # /party <task> — 자동 팀 구성
│   ├── party-team.md                  # /party-team <team> <task> — 팀 지정
│   └── party-status.md                # /party-status — 진행 상황 확인
│
├── skills/                            # 오케스트레이션 스킬
│   └── party-mode/
│       ├── SKILL.md                   # 핵심 라우팅 (~50줄, 매 호출 시 로드)
│       ├── team-orchestration.md      # 팀 경로 상세 (팀 모드일 때만 Read)
│       ├── single-agent.md            # 단일 에이전트 경로 (단일 모드일 때만 Read)
│       ├── prompt-templates.md        # 프롬프트 템플릿 (스폰 시에만 Read)
│       └── approval-gate.md           # 승인 게이트 (승인 단계에서만 Read)
│
├── scripts/                           # 실행 도구 (multi-delegate 재활용)
│   ├── codex_exec.sh                  # Codex CLI 래퍼
│   ├── gemini_exec.sh                 # Gemini CLI 래퍼
│   └── common.sh                      # 공용 유틸
│
├── hooks/                             # 이벤트 훅
│   ├── hooks.json                     # 훅 등록
│   ├── auto-delegate.mjs              # UserPromptSubmit: 에이전트 위임 주입
│   └── post-agent-verify.mjs          # PostToolUse: 에이전트 결과 검수 체크리스트
│
├── CLAUDE.md                          # 프로젝트 수준 파티 정책
├── settings.json                      # Agent Teams 활성화 등 설정
├── package.json
└── .gitignore
```

---

## 10. 에이전트 파일 상세 스펙

### 10.1 claude-agent.md

```markdown
---
name: claude-agent
description: >
  Deep reasoning agent running on Opus. Expert in architectural design,
  code review, security analysis, and technical decision making.
  Use PROACTIVELY for design decisions, complex bug root-cause analysis,
  security audits, and cross-cutting reviews. Adapts role based on
  team context: Architect, Reviewer, Security Auditor, or PL.
tools: Read, Write, Edit, Bash, Grep, Glob
model: opus
---

# Claude Agent — Core Reasoning & Review

## Identity

You are the core reasoning agent in the AI Party system.
Your strengths are deep analysis, architectural design, code review,
and security assessment. You adapt your role based on team context.

## Role Adaptation

Depending on the team you're in, take on the appropriate role:

### As PL (Project Leader)
- Decompose the problem into actionable tasks
- Assign priorities and determine execution order
- Monitor progress and resolve blockers
- Synthesize final results for user approval

### As Architect
- Analyze impact scope of proposed changes
- Design solution approach with tradeoffs
- Define constraints and acceptance criteria
- Validate design against project conventions

### As Reviewer
- Review code changes via git diff
- Check: scope adherence, naming conventions, security, test coverage
- Verdict: PASS / MINOR (fix directly) / REJECT (explain reason)
- Never approve security-sensitive code without thorough analysis

### As Security Auditor
- Scan for hardcoded secrets, SQL injection, XSS, auth bypass
- Review permission checks and encryption usage
- Flag any security concerns as CRITICAL

## Communication Protocol

When in party mode:
1. Always state your current role at message start
2. Be specific with file paths and line numbers
3. When requesting work from others, include clear acceptance criteria
4. When reviewing, provide actionable feedback with examples

## Constraints

- NEVER approve code you haven't reviewed
- NEVER skip security checks on auth/crypto/permission code
- Always provide rollback strategy for risky changes
- Max 2 retry cycles, then escalate to user
```

### 10.2 gemini-agent.md

```markdown
---
name: gemini-agent
description: >
  Large-scale analysis agent powered by Gemini CLI.
  Expert in log analysis, metric evaluation, codebase scanning,
  and documentation generation. Use PROACTIVELY for any task
  requiring analysis of large files, bulk data processing,
  or comprehensive documentation. Leverages Gemini's long context window.
  Actual heavy analysis is delegated to Gemini CLI; this session
  handles result interpretation and inter-agent communication.
tools: Read, Bash, Grep, Glob
model: sonnet
---

# Gemini Agent — Analysis & Documentation

## Identity

You are the analysis specialist in the AI Party system.
You leverage Gemini CLI for tasks requiring large context processing.
Your strengths are log analysis, data analysis, codebase scanning,
and documentation generation.

## External Tool Usage

For heavy analysis tasks, delegate to Gemini CLI:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini_exec.sh" \
  --task "<analysis task>" --workdir "$(pwd)"
```

For file-based analysis (pipe files via stdin):
```bash
cat <files> | gemini -p "<task>" --output-format json -y
```

## Role Adaptation

### As Analyst
- Analyze logs, metrics, error patterns
- Identify root causes with data evidence
- Quantify impact (error counts, affected users, cost)
- Present findings with specific file paths and line numbers

### As Data Analyst
- Process cost/pricing data, performance metrics
- Calculate savings, efficiency gains
- Generate comparison tables and trend analysis

### As Doc Writer
- Generate comprehensive documentation
- Create API docs from source code
- Write architecture decision records (ADRs)

### As Scanner
- Scan large codebases for patterns
- Find all usages of deprecated APIs
- Inventory dependencies and their versions

## Communication Protocol

When sharing analysis results:
1. Start with a summary (1-2 lines)
2. Follow with evidence (specific log entries, metrics, file paths)
3. End with recommendation
4. If analysis is inconclusive, say so and suggest next steps

## Constraints

- NEVER modify files directly — analysis and reporting only
- When code changes are needed, request from Codex or Claude agent
- Always cite specific evidence for claims
- If Gemini CLI fails, fall back to Claude's native analysis
- Max 2 retries on Gemini CLI, then switch to native analysis
```

### 10.3 codex-agent.md

```markdown
---
name: codex-agent
description: >
  Code generation agent powered by Codex CLI.
  Expert in writing, modifying, and fixing code. Use PROACTIVELY
  for code implementation, test writing, config generation,
  and PR creation. Actual code generation is delegated to Codex CLI;
  this session handles result interpretation, inter-agent communication,
  and follow-up coordination.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

# Codex Agent — Code Generation & Modification

## Identity

You are the implementation specialist in the AI Party system.
You leverage Codex CLI for code generation and modification tasks.
Your strengths are writing clean code, fixing bugs, generating tests,
and creating configuration files.

## External Tool Usage

For code generation/modification tasks, delegate to Codex CLI:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/codex_exec.sh" \
  --task "<implementation task>" --workdir "$(pwd)"
```

For follow-up fixes using thread resume:
```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/codex_exec.sh" \
  --thread-id "<id>" --task "<fix>" --workdir "$(pwd)"
```

## Role Adaptation

### As Builder
- Implement features based on Architect's design
- Follow project conventions strictly
- Include inline comments for non-obvious logic
- Generate PR with clear title and description

### As Fixer
- Apply minimal, targeted fixes
- Preserve existing behavior outside fix scope
- Add regression tests for the fix

### As Test Writer
- Write unit tests with good edge case coverage
- Follow existing test patterns in the project
- Include both positive and negative test cases

### As Config Generator
- Generate K8s manifests, Helm values, Terraform files
- Follow existing config conventions
- Include comments explaining non-default values

## Communication Protocol

When reporting implementation results:
1. List files created/modified
2. Summarize what was changed and why
3. Note any decisions made during implementation
4. Flag anything that needs review attention

## Constraints

- NEVER implement security-sensitive code (auth, crypto, permissions)
  — defer to Claude agent
- Always run existing tests after modification
- If tests fail after 2 fix attempts, escalate to party
- Include thread_id in status for potential follow-up
- NEVER modify files outside the requested scope
```

---

## 11. 팀 프리셋 상세 스펙

> 실제 파일 형식: Markdown + YAML frontmatter (`teams/*.md`)
> 아래는 bugfix 팀의 실제 구현 예시. 다른 팀도 동일 패턴.

### 11.1 bugfix.md (실제 형식)

```markdown
---
name: bugfix
description: "버그 분석→수정→리뷰→PR 파이프라인"
trigger_keywords:
  - error
  - exception
  - NPE
  - bug
  - 에러
  - 버그
  - 장애
---

# Bugfix Team

## Members

### gemini-agent as analyst
- **Phase**: analyzing
- **Instructions**: 로그/소스 분석, 근본 원인 파악, 에러 횟수/영향 범위 보고

### claude-agent as architect
- **Phase**: analyzing, planning
- **Instructions**: 분석 결과 기반 수정 방향 설계, 변경 범위 최소화

### codex-agent as builder
- **Phase**: executing
- **Instructions**: 설계에 따라 코드 수정, 테스트 실행 및 추가

### claude-agent as reviewer
- **Phase**: reviewing
- **Instructions**: 변경 사항 리뷰 (보안/컨벤션/테스트). architect와 별도 세션.

## Workflow

1. **ANALYZING**: gemini-agent(analyst) + claude-agent(architect) 병렬
2. **PLANNING**: claude-agent(architect) — depends on ANALYZING
3. **EXECUTING**: codex-agent(builder) — depends on PLANNING
4. **REVIEWING**: claude-agent(reviewer) — depends on EXECUTING
5. **APPROVAL**: Host가 결과 종합 → 사용자에게 승인 요청
```

### 11.2 devops.md (요약)

```markdown
---
name: devops
description: "K8s 리소스 최적화, 배포, 인프라 설정 변경 파이프라인"
trigger_keywords:
  - kubernetes
  - k8s
  - resource
  - cpu
  - memory
  - deploy
  - helm
  - 리소스
  - 배포
  - 스케일
  - 클러스터
---

# DevOps Team

## Members

### gemini-agent as analyst
- **Phase**: analyzing
- **Instructions**: 메트릭/단가표/리소스 사용량 분석, 과다·과소 할당 식별, 비용 절감 가능액 산출

### claude-agent as architect
- **Phase**: planning
- **Instructions**: 분석 결과 기반 최적화 전략 수립, 변경 전/후 비교, 실행·롤백 명령 포함

### codex-agent as builder
- **Phase**: executing
- **Instructions**: helm values/k8s manifest/terraform 수정, kubectl/helm 실행 명령 생성

## Workflow

1. **ANALYZING**: gemini-agent(analyst) — 메트릭 분석
2. **PLANNING**: claude-agent(architect) — depends on ANALYZING
3. **EXECUTING**: codex-agent(builder) — depends on PLANNING
4. **APPROVAL**: Host가 결과 종합 → 실행/롤백 명령 + 비용 영향 제시
```

### 11.3 dev-backend.md (요약)

```markdown
---
name: dev-backend
description: "백엔드 API 개발 파이프라인 — 설계→구현→리뷰"
trigger_keywords:
  - api
  - endpoint
  - service
  - controller
  - backend
  - 개발
  - 기능
---

# Dev-Backend Team

## Members

### claude-agent as architect
- **Phase**: planning
- **Instructions**: API 설계, 데이터 모델, 에러 처리 방식 정의. 기존 프로젝트 패턴 준수.

### codex-agent as builder
- **Phase**: executing
- **Instructions**: Controller/Service/Repository/DTO 구현, 단위 테스트 작성

### claude-agent as reviewer
- **Phase**: reviewing
- **Instructions**: 설계 준수 여부, 예외 처리, 테스트 커버리지 검토. architect와 별도 세션.

## Workflow

1. **PLANNING**: claude-agent(architect) — API 설계
2. **EXECUTING**: codex-agent(builder) — depends on PLANNING
3. **REVIEWING**: claude-agent(reviewer) — depends on EXECUTING
4. **APPROVAL**: Host가 결과 종합 → 사용자에게 승인 요청
```

---

## 12. 커맨드 설계

### 12.1 /party — 자동 팀 구성

```markdown
---
description: Analyze a task and auto-assemble the best AI party team
argument-hint: <task or issue description>
allowed-tools: Bash, Read, Grep, Glob, Task
---

# /party

자동으로 최적의 팀을 구성하여 파티 모드를 시작한다.

## Protocol

1. $ARGUMENTS 분석
2. SKILL.md의 팀 선택 기준에 따라 팀 프리셋 결정
3. 해당 팀의 teams/*.md 로드
4. Agent Teams 세션 생성 (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)
5. 팀원 스폰 및 워크플로우 실행
6. 각 단계 완료 시 상태 업데이트
7. 최종 결과 → 승인 게이트

## 사용 예시

/party reservation-deploy에서 NPE가 계속 발생하고 있어. 분석하고 수정해줘
/party KR2 클러스터의 CPU 과다 할당 리소스를 찾아서 최적화해줘
/party 새로운 예약 취소 API를 만들어줘
```

### 12.2 /party-team — 팀 지정

```markdown
---
description: Start a party with a specific team preset
argument-hint: <team-name> <task description>
allowed-tools: Bash, Read, Grep, Glob, Task
---

# /party-team

지정한 팀으로 파티 모드를 시작한다.

## Protocol

1. 첫 번째 인자에서 팀 이름 추출
2. teams/<team-name>.md 로드
3. 나머지 인자를 태스크로 전달
4. /party와 동일한 워크플로우 실행

## 사용 예시

/party-team bugfix ReportServiceImpl NPE 수정
/party-team devops KR2 클러스터 리소스 최적화
/party-team dev-backend 예약 취소 API 개발
```

### 12.3 /party-status — 진행 상황

```markdown
---
description: Check the current party session status
allowed-tools: Read
disable-model-invocation: true
---

# /party-status

현재 파티 세션의 진행 상황을 표시한다.

## Protocol

1. .party/session.json 읽기
2. 현재 단계, 각 에이전트 상태, 태스크 진행률 표시
3. 승인 대기 항목이 있으면 강조 표시
```

---

## 13. multi-delegate 재활용 전략

### 기존 자산 재활용 (완료)

ai-party는 multi-delegate의 핵심 스크립트를 그대로 복사하여 사용 중:

| 재활용 | 출처 → 위치 | 상태 |
|--------|-------------|------|
| `scripts/codex_exec.sh` | multi-delegate → ai-party | 복사 완료 |
| `scripts/gemini_exec.sh` | multi-delegate → ai-party | 복사 완료 |
| `scripts/common.sh` | multi-delegate → ai-party | 복사 완료 |
| 검수 훅 | `post-delegate-verify.mjs` → `post-agent-verify.mjs` | 파티 상태 연동 추가 |
| 위임 정책 | SKILL.md 단일 파일 → 에이전트별 .md + skill 분리 | 재작성 완료 |

### 공존 구조

두 플러그인은 동일 모노레포에 공존하며, 사용자가 상황에 따라 선택:

- **multi-delegate** — 단일 위임 (`/codex`, `/gemini`, `/delegate`). 간단한 작업.
- **ai-party** — 팀 모드 (`/party`, `/party-team`). 복합 작업 + Agent Teams 기반 파이프라인.

향후 ai-party가 단일 에이전트 경로도 완전히 커버하므로, multi-delegate는 레거시로 유지만 하고 신규 개발은 ai-party에 집중한다.

---

## 14. 사전 요구사항

### 필수 설치

| 도구 | 설치 | 인증 |
|------|------|------|
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` | Anthropic API Key |
| Codex CLI | `npm install -g @openai/codex` | `OPENAI_API_KEY` |
| Gemini CLI | `npm install -g @anthropic-ai/gemini-cli` 또는 Google CLI | Google AI 인증 |
| Node.js | 18+ | - |
| Git | 2.x+ | - |

### 필수 설정

```json
// settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 검증

```bash
# 플러그인 구조 검증
claude plugin validate plugins/ai-party

# 에이전트 목록 확인
claude --plugin-dir plugins/ai-party -c "/agents"

# 팀 프리셋 확인
ls plugins/ai-party/teams/
```

---

## 15. 구현 순서 및 체크리스트

### Phase 1: 기반 구조 + 에이전트 정의 (완료)

```
Step 1: 플러그인 기본 구조
  [x] .claude-plugin/plugin.json 생성
  [x] settings.json (Agent Teams 활성화)
  [x] package.json
  [x] CLAUDE.md (파티 모드 정책)
  [x] .gitignore

Step 2: AI 에이전트 정의
  [x] agents/claude-agent.md
  [x] agents/gemini-agent.md
  [x] agents/codex-agent.md
  [x] /agents 커맨드로 에이전트 로딩 확인

Step 3: 실행 스크립트 (multi-delegate에서 복사)
  [x] scripts/codex_exec.sh
  [x] scripts/gemini_exec.sh
  [x] scripts/common.sh
  [x] 스크립트 독립 테스트
```

### Phase 2: 팀 프리셋 + Agent Teams 오케스트레이션 + 커맨드 (완료)

```
Step 4: 팀 프리셋 정의 (Markdown + YAML frontmatter)
  [x] teams/bugfix.md — 버그 분석→수정→리뷰→PR
  [x] teams/devops.md — 인프라/배포 최적화
  [x] teams/dev-backend.md — 백엔드 API 개발
  [x] teams/dev-frontend.md — 프론트엔드 컴포넌트 개발

Step 5: 오케스트레이션 스킬 고도화
  [x] skills/party-mode/SKILL.md — 복잡도 분기 + 팀 선택 + Agent Teams 프로토콜 + 승인 게이트

Step 6: 커맨드 구현
  [x] commands/party.md — /party <task> 자동 팀 선택
  [x] commands/party-team.md — /party-team <team> <task> 팀 지정
  [x] commands/party-status.md — /party-status 상태 확인

Step 7: 에이전트 Team Mode 업데이트
  [x] agents/claude-agent.md — Team Mode Communication 섹션 추가
  [x] agents/gemini-agent.md — Team Mode Communication 섹션 추가
  [x] agents/codex-agent.md — Team Mode Communication 섹션 추가

Step 8: 프로젝트 설정 업데이트
  [x] CLAUDE.md — 팀 기반 위임 정책 + 커맨드 안내 추가
  [x] hooks/post-agent-verify.mjs — team_name 감지 시 가벼운 검증 분기
  [x] .claude-plugin/plugin.json — v0.5.1 → v0.6.0

Step 9: .party/ Finding Card 구조
  [x] session.json — 세션 메타데이터 (팀, 태스크, 상태, 멤버)
  [x] findings/*.md — 에이전트별 분석/설계/구현/리뷰 결과
  [x] approvals/ — 승인 요청 저장
  [x] history.jsonl — 세션 이벤트 로그
  [x] .gitignore에 .party/ 이미 제외 확인
```

### Phase 3: 실행 엔진 신뢰성 확보

> 핵심: "시키면 반드시 동작하는" 파이프라인. 요청 단위로 팀이 꾸려지고, 상태 머신으로 단계를 강제하며, PreToolUse 훅으로 기계적 제약을 건다.
> OMC(oh-my-claudecode) 패턴을 채택하여 검증된 아키텍처 위에 구축한다.
> `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 필수.

```
Step 10: PreToolUse 기계적 강제 훅
  [ ] hooks/pre-tool-enforce.mjs 생성
      - 파이프라인 활성 상태(.party/session.json exists + status != IDLE)에서
        Host가 직접 Read/Edit/Write/Bash 호출 시 차단 + "에이전트에게 위임하라" 메시지
      - Task 도구 호출은 허용 (에이전트 스폰)
      - 승인 게이트 단계(AWAITING_APPROVAL)에서는 Host 직접 도구 허용
      - OMC 패턴: systemMessage 설득이 아닌 기계적 차단
  [ ] hooks/pre-tool-model-inject.mjs 생성
      - Task 도구 호출 시 subagent_type이 ai-party 에이전트면 model 파라미터 자동 주입
      - claude-agent → opus, gemini-agent → sonnet, codex-agent → sonnet
      - OMC delegation-enforcer.js 패턴 채택
  [ ] hooks.json에 PreToolUse 이벤트 등록

Step 11: 파이프라인 상태 머신
  [ ] hooks/pipeline-state.mjs 생성 — 상태 관리 엔진
      상태: IDLE → ANALYZING → PLANNING → EXECUTING → REVIEWING → AWAITING_APPROVAL
              → APPROVED / REJECTED / REVISION → DONE / ROLLED_BACK
      전환 규칙:
        - 허용된 전환만 가능 (OMC transitions.js 패턴)
        - 가드: 이전 단계 artifact(findings/*.md) 존재해야 다음 전환 허용
        - fix loop: 최대 3회 재시도 후 FAILED
        - 취소 + 재개 지원 (preserve_for_resume 플래그)
  [ ] .party/session.json 스키마 확정
      {
        id: "party-{team}-{timestamp}",
        team: "bugfix",
        task: "원본 요청",
        phase: "ANALYZING",
        phase_history: [{ phase, entered_at, reason }],
        execution: {
          workers_total, workers_active,
          tasks_total, tasks_completed, tasks_failed
        },
        fix_loop: { attempt: 0, max_attempts: 3 },
        cancel: { requested: false, preserve_for_resume: false },
        artifacts: { analysis_path, design_path, review_path },
        members: [{ name, agent, role }]
      }
  [ ] 상태 전환 시 history.jsonl에 이벤트 append
  [ ] 모드 레지스트리: 동시 파이프라인 방지 (OMC mode-registry 패턴)

Step 12: 파일 기반 핸드오프 구현
  [ ] .party/ 디렉토리 자동 초기화 (/party 실행 시)
  [ ] 각 단계 에이전트가 findings/{phase}.md에 결과 저장
      - analysis.md: 에러 로그, 발생 횟수, 영향 범위, 근본 원인
      - design.md: 수정 방향, 영향 파일, 대안
      - implementation.md: 변경 파일, git diff 요약, 테스트 결과
      - review.md: 검토 결과, 보안/컨벤션/테스트 판정
  [ ] 다음 단계 에이전트 프롬프트에 이전 findings 경로 + 내용 주입
  [ ] 원자적 JSON 쓰기 (OMC atomic-write 패턴 — 크래시 안전)
  [ ] SendMessage는 시그널용으로만 사용 ("analysis 완료, design 시작 가능")

Step 13: 요청 단위 팀 구성 (Per-Request Team Formation)
  [ ] /party 커맨드 실행 시:
      1. teams/*.md의 trigger_keywords로 팀 자동 매칭
      2. TeamCreate(team_name="party-{team}-{timestamp}")
      3. 워크플로우 단계별 TaskCreate (blockedBy 의존성 체인)
      4. 팀 멤버별 Task(subagent_type, team_name, name) 스폰
      5. Worker Preamble 주입 (OMC preamble.js 패턴)
         - 역할, 태스크, 팀 컨텍스트
         - SendMessage 사용법, TaskUpdate 사용법
         - findings/ 저장 지시
         - shutdown 프로토콜
      6. TaskList 모니터링 → 단계 전환 → 승인 게이트
      7. 팀 종료 (SendMessage shutdown_request → 응답 대기 → TeamDelete)
  [ ] 세션 격리: 동시 파이프라인 방지 (.party/session.json 존재 체크)
  [ ] 에이전트 헬스 체크: 일정 시간 무응답 시 리드가 감지 + 재스폰 or 에스컬레이션

Step 14: 벤치마크
  [ ] 동일 작업(shopping_md_fe 실제 이슈)을 세 가지 방식으로 실행:
      A) 단일 에이전트 — 기존 ai-party 기본 (auto-delegate → Task 1개)
      B) 파이프라인 팀 — 상태 머신 + 핸드오프 + PreToolUse 강제
      C) 자유 위임 — Host가 판단해서 에이전트 조합 (파이프라인 없이)
  [ ] 비교 지표:
      - 최종 결과 품질 (코드 정확성, 테스트 통과, 리뷰 품질)
      - 소요 시간 (첫 스폰 → 최종 결과)
      - 토큰 비용 (에이전트별 토큰 사용량)
      - 성공률 (파이프라인 완주율, 에이전트 실패 비율)
      - 강제성 (Host가 직접 처리하지 않았는지)
  [ ] 벤치마크 결과를 .party/benchmarks/에 기록
  [ ] 결과 기반으로 Phase 4 방향 결정

Step 15: 검증 및 배포
  [ ] claude plugin validate .
  [ ] 전체 파이프라인 end-to-end 테스트 (bugfix 팀 기준)
  [ ] marketplace.json 버전 업데이트 (v0.7.0)
  [ ] git push
```

### Phase 4: AI OPS 플랫폼 프로젝트 생성 (별도 레포)

> ai-party 플러그인은 "실행 엔진"으로 남고, 플랫폼은 별도 프로젝트로 그 위에 올라가는 구조.
> 플랫폼이 "무엇을 할지" 결정하고, 플러그인이 "어떻게 할지" 실행한다.

```
Step 16: 프로젝트 레지스트리 + DB
  [ ] 별도 레포 생성 (ai-ops-platform 또는 유사)
  [ ] SQLite DB 스키마 설계
      - projects: id, name, repo_path, branch_strategy, tech_stack, conventions, env_config
      - credentials: id, project_id, type, encrypted_value, scope
      - sessions: id, project_id, team, task, status, created_at, completed_at
      - findings: id, session_id, phase, content, created_at
      - approvals: id, session_id, summary, status, decided_at, decided_by
  [ ] 프로젝트 CRUD API (등록, 수정, 삭제, 조회)
  [ ] 인증 정보 암호화 저장 (AES-256 + 마스터 키)

Step 17: Claude Code 인스턴스 관리
  [ ] SessionStart 훅 — cwd 기반 프로젝트 자동 감지 → DB에서 정보 로드 → systemMessage 주입
  [ ] Claude Code 인스턴스 실행 매니저
      - 프로젝트 디렉토리로 cd → ai-party 플러그인 활성 상태에서 실행
      - 환경변수 주입 (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1, 프로젝트별 설정)
  [ ] .party/ 결과물 수집 → DB 저장 (파이프라인 완료 시)
  [ ] 팀/에이전트 설정 외부화 (DB에서 로드, 플러그인 코드 수정 없이 변경 가능)

Step 18: API 서버
  [ ] 기술 스택 선정 (Node.js/Fastify 또는 Python/FastAPI)
  [ ] REST API 엔드포인트:
      - POST /tasks — 작업 요청 수신 → 팀 자동 구성 → 파이프라인 실행
      - GET /tasks/:id — 작업 상태 조회
      - POST /tasks/:id/approve — 승인
      - POST /tasks/:id/reject — 거절
      - GET /projects — 프로젝트 목록
      - CRUD /projects/:id — 프로젝트 관리
      - GET /sessions — 세션 이력
      - GET /sessions/:id/findings — 세션별 findings
  [ ] claude remote-control 연동 지원
      - 플랫폼 프로젝트 디렉토리에서 `claude remote-control` 실행
      - 핸드폰 Claude.ai에서 채팅으로 작업 지시 가능
```

### Phase 5: 웹 대시보드 + 승인 워크플로우

```
Step 19: 웹 대시보드 (읽기)
  [ ] 프론트엔드 기술 스택 선정 (React/Next.js 또는 Vue/Nuxt)
  [ ] 화면 구성:
      - 프로젝트 목록 + 등록/수정
      - 활성 세션 목록 + 단계별 진행률
      - findings 뷰어 (분석/설계/구현/리뷰 카드)
      - 에이전트별 상태
  [ ] 실시간 업데이트 (WebSocket 또는 SSE)

Step 20: 승인 게이트 UI
  [ ] 파이프라인 AWAITING_APPROVAL 단계에서 웹으로 알림
  [ ] 승인 화면: git diff + findings 요약 + approve/reject/revise 버튼
  [ ] 승인 이력 관리

Step 21: 이력 + 분석
  [ ] 팀별/프로젝트별 성공률, 평균 소요 시간
  [ ] 에이전트별 성능 비교 (벤치마크 데이터 누적)
  [ ] 토큰 비용 분석 (에이전트별 사용량 추적)
  [ ] 추세 그래프
```

### Phase 6: 프로덕션 + 확장

```
Step 22: 멀티 유저 + 접근 제어
  [ ] 사용자 인증 (OAuth 또는 기본 인증)
  [ ] 프로젝트별 권한 관리
  [ ] 감사 로그

Step 23: 자동 트리거
  [ ] GitHub Webhook 연동 (Issue 생성 → 자동 팀 구성)
  [ ] 스케줄 기반 실행 (cron)
  [ ] 모니터링 알림 연동 (에러 감지 → 자동 bugfix 팀 소집)

Step 24: 동시 실행 + 스케일링
  [ ] 여러 프로젝트 요청 병렬 처리
  [ ] 리소스 관리 (동시 에이전트 수 제한)
  [ ] 큐 시스템 (우선순위 기반)

Step 25: 추가 팀 프리셋 + 커스터마이징
  [ ] security, planning, migration 등 추가 팀
  [ ] 동적 팀 구성 고도화
  [ ] 사용자 정의 팀 프리셋 (대시보드에서 생성)
  [ ] 알림 연동 (카카오워크/슬랙)
```

---

## 16. 전체 아키텍처 — AI OPS 플랫폼

### 16.1 시스템 구조

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
│         │                │                  │            │
│         └────────────────┼──────────────────┘            │
│                          │                               │
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
│  │  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 (필수)  │      │
│  └────────────────────────────────────────────────┘      │
│                                                          │
│  접속 채널:                                                │
│  ├── 💻 웹 대시보드: 모니터링, 승인, 이력, 프로젝트 관리     │
│  ├── 📱 claude remote-control: 모바일에서 작업 지시         │
│  └── 🔗 GitHub Webhook: 자동 트리거                        │
└──────────────────────────────────────────────────────────┘
```

### 16.2 관계 정리

```
AI OPS Platform (별도 프로젝트)    ai-party (Claude Code 플러그인)
├── "무엇을 할지" 결정              ├── "어떻게 할지" 실행
├── 프로젝트/인증 관리              ├── 에이전트 정의 + 팀 프리셋
├── 웹 대시보드 + API              ├── 파이프라인 상태 머신
├── 세션/이력/승인 DB              ├── PreToolUse 강제 훅
├── Claude Code 인스턴스 관리       ├── 파일 핸드오프 (.party/)
└── 사용자 인터페이스              └── 승인 게이트 (CLI)
         │                                  ▲
         └─── ai-party 플러그인을 설치한 ────┘
              Claude Code 인스턴스를 실행
```

### 16.3 모바일 시나리오

```
핸드폰에서 Claude.ai → "shopping_md NPE 수정해줘"
  │
  ▼
claude remote-control (로컬 PC에서 실행 중)
  │
  ▼
AI OPS Platform → 프로젝트 정보 + 인증 자동 로드
  │
  ▼
ai-party 파이프라인 → 팀 구성 → 분석 → 설계 → 구현 → 리뷰
  │
  ▼
승인 게이트 → Claude.ai 채팅 또는 웹 대시보드에서 승인/거절
```

### 16.4 보안 원칙

- 인증 정보는 플랫폼 DB에 암호화 저장 (AES-256 + 마스터 키)
- 에이전트에게는 필요한 최소 권한만 런타임에 주입
- secrets가 프롬프트나 findings에 노출되지 않도록 필터링
- 개발자별 프로젝트 접근 권한 관리

### 16.5 Skill 구조화 원칙 — 컨텍스트 메모리 최적화

Claude Code의 skill 로딩 메커니즘:
1. **description**은 항상 컨텍스트에 로드 (매 턴마다 토큰 소모)
2. **SKILL.md 전체 내용**은 skill 호출 시에만 로드
3. **지원 파일**은 Claude가 Read할 때만 로드

따라서 모든 skill은 다음 패턴을 따른다:

```
my-skill/
├── SKILL.md              # 필수. 핵심 라우팅/판단만. 50~100줄 이하 권장
├── reference.md          # 상세 프로토콜 — 필요할 때만 Read
├── examples.md           # 예제 — 필요할 때만 Read
└── scripts/              # 실행 스크립트 — 실행만, 로드 안 함
```

**규칙:**
- SKILL.md에는 "무엇을 해야 하는가"만 (라우팅 테이블, 판단 기준)
- "어떻게 하는가"는 지원 파일로 분리 (Read 참조 링크)
- description은 2줄 이내로 간결하게
- SKILL.md에서 지원 파일을 `[file.md](file.md)` 형태로 참조하여 Claude가 필요할 때 읽게 함
- 500줄 이상의 SKILL.md는 반드시 분리

---

## 17. OMC(oh-my-claudecode) 채택 패턴

> Phase 3에서 OMC의 검증된 패턴을 선택적으로 채택한다.
> OMC 포크가 아닌, 필요한 아키텍처 패턴만 가져와서 ai-party에 맞게 구현.

### 17.1 채택하는 패턴

| OMC 패턴 | ai-party 적용 | 이유 |
|----------|--------------|------|
| **PreToolUse 강제** (`delegation-enforcer.js`) | `hooks/pre-tool-enforce.mjs` | systemMessage는 모델이 무시 가능. 기계적 차단 필수 |
| **파이프라인 상태 머신** (`team-pipeline/`) | `hooks/pipeline-state.mjs` | 엄격한 phase 전환 + 가드 + fix loop |
| **Worker Preamble** (`agents/preamble.js`) | 에이전트 스폰 프롬프트에 포함 | 역할 경계 명확화 + shutdown 프로토콜 |
| **모드 레지스트리** (`mode-registry/`) | `.party/session.json` 기반 | 동시 파이프라인 방지 |
| **원자적 JSON 쓰기** (`lib/atomic-write.js`) | `.party/` 파일 쓰기 전체 | 크래시 안전성 |
| **실행 통계 추적** (swarm summary) | `.party/session.json` 내 execution 필드 | 진행률 모니터링 |
| **취소 + 재개** (cancel protocol) | 파이프라인 상태 머신 내 | 작업 손실 방지 |

### 17.2 채택하지 않는 패턴

| OMC 패턴 | 이유 |
|----------|------|
| **Swarm SQLite 태스크 풀** | ai-party는 Agent Teams TaskList 사용. SQLite 이중 관리 불필요 |
| **tmux 기반 워커 스폰** | Claude Code의 Task 도구가 더 안정적. tmux 의존성 제거 |
| **OMX Interop** | ai-party는 Claude Code 단일 플랫폼. 크로스 도구 불필요 |
| **31개 훅 전체** | 필요한 훅만 선택적 구현. 과도한 훅은 디버깅 어렵게 함 |

### 17.3 ai-party만의 차별점

| 영역 | OMC | ai-party |
|------|-----|----------|
| **에이전트 협업** | 계층적 (worker→lead 보고만) | P2P 메시징 가능 (SendMessage) |
| **팀 구성** | 고정 파이프라인 (plan→prd→exec→verify→fix) | 팀 프리셋 기반 동적 구성 |
| **외부 AI** | Gemini/Codex 통합 deprecated | Gemini CLI + Codex CLI 적극 활용 |
| **승인 게이트** | 없음 (자동 실행) | 필수 (사람이 최종 결정) |
| **플랫폼 비전** | Claude Code 플러그인으로 완결 | 별도 AI OPS 플랫폼의 실행 엔진 |

---

## 18. 로드맵 타임라인

### Phase 3: 실행 엔진 신뢰성 (현재 → 다음)

```
ai-party 플러그인 내 작업 (이 레포)
  - PreToolUse 훅 → 기계적 강제
  - 파이프라인 상태 머신 → 단계 강제
  - 파일 핸드오프 → findings/ 기반 정보 전달
  - 요청 단위 팀 구성 → Agent Teams 필수
  - 벤치마크 → shopping_md_fe 실제 이슈로 검증

  버전: v0.7.0
  산출물: 신뢰할 수 있는 파이프라인 + 벤치마크 결과
```

### Phase 4: AI OPS 플랫폼 MVP

```
별도 프로젝트 생성
  - SQLite DB + 프로젝트 레지스트리
  - API 서버 (REST)
  - SessionStart 훅 → DB 연동
  - Claude Code 인스턴스 관리
  - claude remote-control 지원

  산출물: 프로젝트 등록 → 작업 요청 → 파이프라인 실행 → 결과 수집
```

### Phase 5: 대시보드 + 승인 UI

```
웹 프론트엔드
  - 프로젝트/세션 관리 화면
  - findings 뷰어
  - 승인 게이트 UI
  - 실시간 진행 상황
  - 이력/통계

  산출물: 웹에서 전체 워크플로우 관리 가능
```

### Phase 6: 프로덕션

```
운영 수준 기능
  - 멀티 유저 + 접근 제어
  - GitHub Webhook 자동 트리거
  - 동시 실행 + 큐 시스템
  - 추가 팀 프리셋 + 커스터마이징
  - 알림 연동

  산출물: 완전한 AI OPS 자동화 플랫폼
```

### 최종 비전

```
AI OPS 자동화 플랫폼
  - 개발자는 프로젝트를 등록하고, 작업을 요청하기만 하면 됨
  - AI들이 팀을 구성하여 분석 → 설계 → 구현 → 리뷰
  - 모든 결과는 대시보드에서 확인
  - 모바일(claude remote-control)로 어디서든 지시 + 승인
  - 사람이 승인하기 전까지 AI는 아무것도 실행하지 않음
  - 승인하면 모든 것을 실행
```

---

## 참고

### 기술 기반

- Claude Code Subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code Agent Teams: https://code.claude.com/docs/en/agent-teams
- Claude Code Plugins: https://code.claude.com/docs/en/plugins
- Claude Code Remote Control: `claude remote-control`
- Gemini CLI Headless: https://google-gemini.github.io/gemini-cli/docs/cli/headless.html
- Codex CLI: https://github.com/openai/codex

### 선행 프로젝트 / 참고 자료

- multi-delegate plugin (Phase 1 완료): https://github.com/atototo/claude-plugins
- oh-my-claudecode (OMC): https://github.com/Yeachan-Heo/oh-my-claudecode — Phase 3 아키텍처 패턴 참조
- oh-my-opencode: https://github.com/code-yeongyu/oh-my-opencode — 프롬프트 기반 라우팅 참조
- 설계 문서: multi-delegate-plugin-design.md
- 모노레포 설계: claude-plugins-monorepo-design.md
