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
16. [확장 로드맵](#16-확장-로드맵)

---

## 1. 비전과 목표

### 궁극적 비전

AI 에이전트들이 **파티 모드**로 자율 협업하되, 모든 결정권은 사람에게 있는 구조.
이슈가 발생하면 AI들이 자기들끼리 논의하고, 분석하고, 계획 세우고, 구현하고,
리뷰까지 마친 후 사람에게 승인을 요청한다.

### 핵심 원칙

- **AI 유닛 기반**: PL/Architect 같은 역할이 아닌, Claude/Gemini/Codex 각 AI의 **강점**을 정의
- **팀 조합 프리셋**: 문제 유형에 따라 AI 유닛들의 조합(팀)을 미리 정의하되, 동적 구성도 가능
- **파티 모드**: Agent Teams를 활용하여 에이전트 간 **직접 메시징**, 태스크 공유, 상호 피드백
- **승인 게이트**: 코드 변경, PR 생성, 배포 등 실제 액션은 반드시 사용자 승인 후 실행
- **점진적 확장**: CLI 동작 → 알림 통합 → 대시보드 UI 순서로 발전

### 설계 목표

```
문제에 따라 AI들이 자율적으로 모여서:
  1. 파티 모드로 문제 현상에 대해 논의
  2. 기능/업무에 따라 적절한 에이전트가 가져감
  3. 리뷰를 상호 수행 (AI가 AI를 리뷰)
  4. 최종 결과를 사람에게 보고 → 승인 대기
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
│설계  ││+CLI  ││+CLI  │  ← 서로 직접 메시징
│리뷰  ││분석  ││구현  │
└──┬───┘└──┬───┘└──┬───┘-
   │       │       │
   └───────┼───────┘
           │
    ┌──────┴──────┐
    │  파티 모드    │
    │  - 상호 논의  │
    │  - 태스크 분배 │
    │  - 상호 리뷰  │
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
│  teams/bugfix.yaml, teams/devops.yaml, ...   │
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
실제 작업은 독립 컨텍스트의 에이전트들이 수행하며, 에이전트끼리 직접 메시징으로 논의.
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
  - 다른 에이전트(gemini, codex)와 직접 메시징으로 논의
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
  │     독립 컨텍스트, 직접 메시징 가능
  │
  ├─→ gemini-agent.md ─── 분석/문서 전문
  │     모델: sonnet + Gemini CLI
  │     독립 컨텍스트, 직접 메시징 가능
  │
  └─→ codex-agent.md ─── 구현/수정 전문
        모델: sonnet + Codex CLI
        독립 컨텍스트, 직접 메시징 가능
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

### 5.1 팀 목록

| 팀 | 트리거 | 구성 | 용도 |
|---|--------|------|------|
| **bugfix** | NPE, 에러, 예외 | Gemini(분석) + Claude(설계/리뷰) + Codex(수정) | 버그 분석 → 수정 → PR |
| **devops** | 리소스 이상, 배포 이슈 | Gemini(메트릭분석) + Claude(전략) + Codex(설정수정) | 인프라 최적화, 배포 |
| **dev-backend** | API 개발, 기능 추가 | Claude(설계) + Codex(구현) + Claude(리뷰) | 백엔드 기능 개발 |
| **dev-frontend** | UI 개발, 컴포넌트 | Claude(설계) + Codex(구현) + Gemini(기존분석) | 프론트엔드 개발 |
| **planning** | 기획, 요구사항 분석 | Claude(기획) + Gemini(데이터분석) | 기능 기획, 스펙 작성 |
| **security** | 보안 감사, 취약점 | Claude(보안감사) + Gemini(스캔) + Codex(패치) | 보안 점검 및 수정 |
| **review** | PR 리뷰, 코드 리뷰 | Claude(로직리뷰) + Gemini(영향분석) | 코드 리뷰 |
| **migration** | DB/시스템 마이그레이션 | Gemini(영향분석) + Claude(전략) + Codex(스크립트) | 마이그레이션 |

### 5.2 팀 자동 선택 기준

```
이슈/요청 분석
  │
  ├─ 에러/예외/NPE/5xx 키워드? → bugfix 팀
  ├─ K8s/리소스/메트릭/배포 키워드? → devops 팀
  ├─ API/엔드포인트/서비스 개발? → dev-backend 팀
  ├─ UI/컴포넌트/페이지 개발? → dev-frontend 팀
  ├─ 기획/요구사항/스펙? → planning 팀
  ├─ 보안/취약점/인증? → security 팀
  ├─ PR/리뷰/코드리뷰? → review 팀
  ├─ 마이그레이션/DB변경? → migration 팀
  │
  └─ 판단 불가? → Claude가 문제 분석 후 동적 팀 구성
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

```
[ANALYZING 단계]
  - Gemini: 로그/데이터/소스 분석
  - Claude: 1차 가설 수립
  - 파티 모드: 분석 결과 공유, 가설 검증 논의

[PLANNING 단계]
  - Claude: 해결 전략 수립, 영향 범위 파악
  - Gemini: 관련 자료/코드 추가 조사
  - 파티 모드: 전략 논의, 대안 제시, 합의 도출

[EXECUTING 단계]
  - Codex: 코드 생성/수정
  - Claude: 방향 가이드, 중간 점검
  - 파티 모드: 구현 중 이슈 실시간 논의

[REVIEWING 단계]
  - Claude: 코드 리뷰, 보안 체크
  - Gemini: 영향 범위 재확인
  - 파티 모드: 리뷰 결과 논의, 수정 요청

[AWAITING_APPROVAL 단계]
  - Lead: 전체 결과 요약, 승인 요청
  - 사용자: 승인 / 거절 / 수정 요청
```

---

## 7. 파티 모드 통신 프로토콜

### 7.1 Agent Teams 기반

Claude Code의 Agent Teams 기능을 활용:

```
활성화: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

통신 방식:
  - SendMessage: 팀원 간 직접 메시징
  - 공유 태스크 리스트: pending → in_progress → completed
  - 파일 기반 상태 공유: .party/ 디렉토리

팀 리더(Lead):
  - 팀원 스폰 및 태스크 할당
  - 진행 상황 모니터링
  - 교착 상태 해소
  - 최종 결과 종합
```

### 7.2 메시지 포맷 컨벤션

에이전트 간 메시지의 일관성을 위한 구조:

```
[FROM: gemini-agent(analyst)]
[TO: codex-agent(builder)]
[PHASE: EXECUTING]
[TYPE: request]

분석 결과 Map.of()에서 NPE 발생 확인.
수정 방향: HashMap으로 교체 + null guard 추가.
대상 파일: src/main/java/.../ReportServiceImpl.java:39

이 방향으로 코드 수정 부탁.
```

### 7.3 상태 공유 디렉토리

```
프로젝트루트/
└── .party/
    ├── session.json         # 현재 파티 세션 정보
    ├── tasks.json           # 공유 태스크 리스트
    ├── findings/            # 분석 결과물
    │   ├── analysis.md      # Gemini 분석 결과
    │   ├── design.md        # Claude 설계 결과
    │   └── review.md        # 리뷰 결과
    ├── approvals/           # 승인 대기 항목
    │   └── pending.json     # 승인 요청 큐
    └── history.jsonl        # 파티 이력 로그
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
| 분석 결과 보고 | 자동 | 파티 논의 결과 요약만 표시 |
| 설계 방향 제시 | 자동 | 합의된 방향 보고만 |

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
├── teams/                             # Layer 2: 팀 프리셋
│   ├── bugfix.yaml                    # 버그 수정 팀
│   ├── devops.yaml                    # 인프라/배포 팀
│   ├── dev-backend.yaml               # 백엔드 개발 팀
│   ├── dev-frontend.yaml              # 프론트엔드 개발 팀
│   ├── planning.yaml                  # 기획 팀
│   ├── security.yaml                  # 보안 팀
│   ├── review.yaml                    # 리뷰 팀
│   └── migration.yaml                 # 마이그레이션 팀
│
├── commands/                          # Layer 3: 슬래시 커맨드
│   ├── party.md                       # /party <task> — 자동 팀 구성
│   ├── party-team.md                  # /party-team <team> <task> — 팀 지정
│   └── party-status.md                # /party-status — 진행 상황 확인
│
├── skills/                            # 오케스트레이션 스킬
│   └── ai-party/
│       └── SKILL.md                   # 팀 선택 기준, 워크플로우 정의
│
├── scripts/                           # 실행 도구 (multi-delegate 재활용)
│   ├── codex_exec.sh                  # Codex CLI 래퍼
│   ├── gemini_exec.sh                 # Gemini CLI 래퍼
│   └── common.sh                      # 공용 유틸
│
├── hooks/                             # 이벤트 훅
│   ├── hooks.json                     # 훅 등록
│   └── post-party-verify.mjs          # 파티 결과 검증
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

### 11.1 bugfix.yaml

```yaml
name: bugfix
description: >
  버그 분석에서 수정, 리뷰, PR 생성까지의 전체 파이프라인.
  에러 로그/예외/NPE 등의 이슈에 대응.

trigger_keywords:
  - error
  - exception
  - NPE
  - NullPointer
  - 5xx
  - bug
  - 에러
  - 버그
  - 장애

members:
  - agent: gemini-agent
    role: analyst
    phase: [analyzing]
    instructions: >
      로그와 소스코드를 분석하여 에러의 근본 원인을 파악하라.
      에러 발생 횟수, 영향 범위, 관련 파일/라인을 보고하라.

  - agent: claude-agent
    role: architect
    phase: [analyzing, planning]
    instructions: >
      Analyst의 분석 결과를 바탕으로 수정 방향을 설계하라.
      수정 범위를 최소화하고, 기존 동작에 영향이 없도록 하라.

  - agent: codex-agent
    role: builder
    phase: [executing]
    instructions: >
      Architect의 설계에 따라 코드를 수정하라.
      수정 후 기존 테스트를 실행하고, 필요 시 테스트를 추가하라.

  - agent: claude-agent
    role: reviewer
    phase: [reviewing]
    instructions: >
      Builder의 변경 사항을 리뷰하라.
      보안, 컨벤션, 테스트 커버리지를 확인하라.
      ※ architect와 별도 세션으로 스폰되어 독립 관점에서 리뷰.

workflow:
  1_analyze:
    agents: [gemini-agent:analyst, claude-agent:architect]
    mode: parallel
    output: findings/analysis.md

  2_plan:
    agents: [claude-agent:architect]
    depends_on: [1_analyze]
    output: findings/design.md

  3_implement:
    agents: [codex-agent:builder]
    depends_on: [2_plan]
    output: git diff

  4_review:
    agents: [claude-agent:reviewer]
    depends_on: [3_implement]
    output: findings/review.md

  5_approve:
    type: approval_gate
    depends_on: [4_review]
    actions: [merge_pr, reject, revise]
```

### 11.2 devops.yaml

```yaml
name: devops
description: >
  K8s 리소스 최적화, 배포, 인프라 설정 변경 파이프라인.
  메트릭 기반 분석으로 비용 절감 및 안정성 향상.

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

members:
  - agent: gemini-agent
    role: analyst
    phase: [analyzing]
    instructions: >
      메트릭, 단가표, 리소스 사용량을 분석하라.
      과다/과소 할당 식별, 비용 절감 가능액을 산출하라.

  - agent: claude-agent
    role: architect
    phase: [planning]
    instructions: >
      분석 결과를 바탕으로 최적화 전략을 수립하라.
      변경 전/후 비교, 실행 명령, 롤백 명령을 포함하라.

  - agent: codex-agent
    role: builder
    phase: [executing]
    instructions: >
      helm values, k8s manifest, terraform 파일을 수정하라.
      변경 사항에 대한 kubectl/helm 명령을 생성하라.

workflow:
  1_analyze:
    agents: [gemini-agent:analyst]
    output: findings/metrics-analysis.md

  2_plan:
    agents: [claude-agent:architect]
    depends_on: [1_analyze]
    output: findings/optimization-plan.md

  3_implement:
    agents: [codex-agent:builder]
    depends_on: [2_plan]
    output: config diffs + kubectl commands

  4_approve:
    type: approval_gate
    depends_on: [3_implement]
    include:
      - execution_commands
      - rollback_commands
      - cost_impact
    actions: [execute, reject, defer]
```

### 11.3 dev-backend.yaml

```yaml
name: dev-backend
description: >
  백엔드 API 개발 파이프라인.
  설계 → 구현 → 테스트 → 리뷰.

trigger_keywords:
  - api
  - endpoint
  - service
  - controller
  - backend
  - 개발
  - 기능

members:
  - agent: claude-agent
    role: architect
    phase: [planning]
    instructions: >
      API 설계, 데이터 모델, 에러 처리 방식을 정의하라.
      기존 프로젝트 패턴을 따르라.

  - agent: codex-agent
    role: builder
    phase: [executing]
    instructions: >
      설계에 따라 Controller, Service, Repository, DTO를 구현하라.
      단위 테스트를 함께 작성하라.

  - agent: claude-agent
    role: reviewer
    phase: [reviewing]
    instructions: >
      구현된 코드의 설계 준수 여부, 예외 처리, 테스트 커버리지를 검토하라.

workflow:
  1_design:
    agents: [claude-agent:architect]
    output: findings/api-design.md

  2_implement:
    agents: [codex-agent:builder]
    depends_on: [1_design]
    output: git diff

  3_review:
    agents: [claude-agent:reviewer]
    depends_on: [2_implement]
    output: findings/review.md

  4_approve:
    type: approval_gate
    depends_on: [3_review]
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
3. 해당 팀의 teams/*.yaml 로드
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
2. teams/<team-name>.yaml 로드
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

### 기존 자산 재활용

| multi-delegate 파일 | ai-party 위치 | 변경 사항 |
|---------------------|---------------|-----------|
| `scripts/codex_exec.sh` | `scripts/codex_exec.sh` | 그대로 복사 |
| `scripts/gemini_exec.sh` | `scripts/gemini_exec.sh` | 그대로 복사 |
| `scripts/common.sh` | `scripts/common.sh` | 그대로 복사 |
| `hooks/post-delegate-verify.mjs` | `hooks/post-party-verify.mjs` | 파티 상태 연동 추가 |
| `SKILL.md` 위임 정책 | 에이전트 .md에 분산 | AI별 강점 기반으로 재작성 |
| `CLAUDE.md` 위임 기준 | `CLAUDE.md` | 파티 모드 정책으로 확장 |

### 공존 전략

```
claude-plugins/ (모노레포)
├── plugins/
│   ├── multi-delegate/     ← 기존: 단일 위임 (가벼운 사용)
│   │   ├── /codex, /gemini, /delegate 커맨드
│   │   └── 간단한 작업에 적합
│   │
│   └── ai-party/           ← 신규: 파티 모드 (복합 작업)
│       ├── /party, /party-team 커맨드
│       ├── Agent Teams 기반 협업
│       └── 복합적인 작업에 적합
│
└── shared/                  ← 공용 스크립트
    ├── scripts/codex_exec.sh
    ├── scripts/gemini_exec.sh
    └── hooks/post-verify.mjs
```

사용자는 상황에 따라 선택:
- **간단한 위임**: `/codex DTO 만들어` (multi-delegate)
- **복합 파티**: `/party NPE 분석하고 수정해` (ai-party)

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

### Phase 3: 파티 모드 통합 테스트

```
Step 10: 통합 테스트
  [ ] /party-team bugfix <간단한 버그> 테스트
  [ ] /party-team devops <리소스 분석> 테스트
  [ ] /party <자동 팀 선택> 테스트
  [ ] 에이전트 간 메시징 확인
  [ ] 승인 게이트 동작 확인

Step 11: 검증 및 배포
  [ ] claude plugin validate .
  [ ] 마켓플레이스 marketplace.json 업데이트
  [ ] git push (atototo/claude-plugins)
```

### Phase 4: 확장 (향후)

```
  [ ] 추가 팀 프리셋 (security, planning, migration 등)
  [ ] 동적 팀 구성 고도화
  [ ] 알림 연동 (카카오워크/슬랙)
  [ ] 웹 대시보드 UI
  [ ] finding 카드 JSON 포맷 표준화
  [ ] 이력/통계 관리
```

---

## 16. 확장 로드맵

### 단기 (Phase 1~3)

```
CLI 기반 파티 모드
  - 터미널에서 /party 커맨드로 팀 소집
  - 에이전트 간 파티 모드 논의
  - 결과 → 터미널 승인 게이트
```

### 중기 (Phase 4)

```
알림 및 자동화 연동
  - 카카오워크/슬랙 알림으로 승인 요청 전달
  - cron/모니터링 기반 자동 트리거
  - finding 카드 JSON → 외부 시스템 연동
```

### 장기 (Phase 5)

```
대시보드 UI (스크린샷에서 본 시스템과 유사)
  - 칸반 보드: BACKLOG → 분석 중 → 승인 대기 → 완료
  - finding 카드 상세 뷰: 분석/설계/구현/리뷰 결과
  - 승인/거절/유예 버튼
  - 팀 활동 이력 및 통계
```

### 최종 비전

```
운영/개발 자동화 플랫폼
  - 모니터링 → 이슈 자동 감지 → AI 파티 자동 소집
  - 분석 → 계획 → 구현 → 리뷰 → PR → 승인 대기
  - 사람은 승인/거절만 하면 됨
  - AI 스스로는 아무 권한도 없지만,
    승인받으면 모든 것을 실행
```

---

## 참고

### 기술 기반

- Claude Code Subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code Agent Teams: https://code.claude.com/docs/en/agent-teams
- Claude Code Plugins: https://code.claude.com/docs/en/plugins
- Gemini CLI Headless: https://google-gemini.github.io/gemini-cli/docs/cli/headless.html
- Codex CLI: https://github.com/openai/codex

### 선행 프로젝트

- multi-delegate plugin (Phase 1 완료): https://github.com/atototo/claude-plugins
- 설계 문서: multi-delegate-plugin-design.md
- 모노레포 설계: claude-plugins-monorepo-design.md
