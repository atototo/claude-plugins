# Phase 1-2: 기반 구조 + 팀 프리셋 (완료)

> Phase 1: 플러그인 기반 + 에이전트 정의
> Phase 2: 팀 프리셋 + Agent Teams 오케스트레이션 + 커맨드
> 관련: [index.md](index.md) | 다음 → [phase3.md](phase3.md)

---

## Layer 1: AI 에이전트 상세

### 설계 철학

**Host(Claude Code 세션) = Lead/오케스트레이터**로, 팀 소집과 승인 게이트만 담당.
실제 작업은 독립 컨텍스트의 에이전트들이 수행하며, findings 파일 핸드오프로 정보를 전달한다.
역할(PL, Architect, Builder)이 아닌 **AI 모델의 강점**으로 에이전트를 정의한다.

### Host (Lead) — Claude Code 세션 자체

```
역할: 오케스트레이터 전담
  - 요청/이슈 접수 및 분석
  - 팀 프리셋 선택 or 동적 구성
  - Agent Teams 세션 생성 및 팀원 스폰
  - 승인 게이트 관리
  - 교착 상태 해소 및 에스컬레이션
모델: 사용자 세션 설정에 따름
```

### Claude Agent (model: opus)

```
강점: 깊은 추론, 설계, 판단, 코드 리뷰, 보안 분석
역할: Architect, Reviewer, Security Auditor, PL
도구: Read, Write, Edit, Bash, Grep, Glob
```

### Gemini Agent (model: sonnet + Gemini CLI)

```
강점: 대용량 분석, 긴 컨텍스트, 문서 생성
역할: Analyst, Data Analyst, Doc Writer, Scanner
도구: Read, Bash, Grep, Glob (gemini_exec.sh 경유)
```

### Codex Agent (model: sonnet + Codex CLI)

```
강점: 코드 생성/수정, 테스트 작성, sandbox 실행
역할: Builder, Fixer, Test Writer, Config Generator
도구: Read, Write, Edit, Bash, Grep, Glob (codex_exec.sh 경유)
```

### Leader Agent (model: opus) — Phase 3 추가

```
강점: 파이프라인 오케스트레이션, 워커 조율, 상태 관리
역할: 파이프라인 리더 (Host 대신 에이전트 조율 전담)
도구: Read, Write, Bash, Grep, Glob, Task*, SendMessage, AskUserQuestion
```

### 에이전트 확장성

새로운 AI → `agents/` 에 `.md` 파일 하나 추가:
```
agents/
  ├─ claude-agent.md       ← opus, 추론/설계/리뷰
  ├─ gemini-agent.md       ← sonnet + Gemini CLI
  ├─ codex-agent.md        ← sonnet + Codex CLI
  ├─ leader-agent.md       ← opus, 파이프라인 리더
  ├─ deepseek-agent.md     ← 새 AI (미래)
  └─ qwen-agent.md         ← 로컬 LLM (미래)
```

---

## Layer 2: 팀 프리셋 상세

### 설계 철학

팀 프리셋 = AI 에이전트 조합 + 역할 배정 + 워크플로우 정의.
같은 에이전트가 팀에 따라 다른 역할로 참여한다.

### 팀 목록

| 팀 | 파일 | 트리거 | 구성 | 용도 |
|---|------|--------|------|------|
| **bugfix** | `teams/bugfix.md` | error, exception, NPE, bug | Gemini(분석) + Claude(설계/리뷰) + Codex(수정) | 버그 분석 → 수정 → PR |
| **devops** | `teams/devops.md` | k8s, resource, deploy, helm | Gemini(메트릭분석) + Claude(전략) + Codex(설정수정) | 인프라 최적화, 배포 |
| **dev-backend** | `teams/dev-backend.md` | api, endpoint, service, backend | Claude(설계) + Codex(구현) + Claude(리뷰) | 백엔드 기능 개발 |
| **dev-frontend** | `teams/dev-frontend.md` | component, UI, responsive | Claude(설계) + Codex(구현) + Gemini(기존분석) | 프론트엔드 개발 |

> 추가 팀 (security, planning, migration)은 Phase 6에서 구현 예정.

### 팀 자동 선택

```
이슈/요청 분석 → teams/*.md의 trigger_keywords YAML frontmatter 매칭
  ├─ error/exception/NPE/bug → bugfix 팀
  ├─ k8s/resource/deploy/helm → devops 팀
  ├─ api/endpoint/service → dev-backend 팀
  ├─ component/UI/responsive → dev-frontend 팀
  └─ 매칭 없음 → Claude가 동적 팀 구성
```

### 동적 팀 구성

프리셋에 없는 문제 → Lead(Claude)가 자율적으로 에이전트 조합을 결정.

---

## 커맨드 설계

### /party — 자동 팀 구성

```
1. $ARGUMENTS 분석
2. SKILL.md의 팀 선택 기준에 따라 팀 프리셋 결정
3. 해당 팀의 teams/*.md 로드
4. Agent Teams 세션 생성
5. 팀원 스폰 및 워크플로우 실행
6. 최종 결과 → 승인 게이트
```

### /party-team — 팀 지정

첫 번째 인자로 팀 이름 지정 → 해당 팀으로 파이프라인 실행.

### /party-status — 진행 상황

`.party/session.json` 읽기 → 현재 단계, 에이전트 상태, 진행률 표시.

### /party-board — 칸반 보드

`.party/tickets/*.json` → 상태별 그룹핑 → 칸반 형태 출력.
> Phase 5 웹 대시보드의 터미널 선행 버전. tickets.mjs 연동 후 활성화.

---

## multi-delegate 재활용

| 재활용 | 출처 → 위치 | 상태 |
|--------|-------------|------|
| `scripts/codex_exec.sh` | multi-delegate → ai-party | ✅ |
| `scripts/gemini_exec.sh` | multi-delegate → ai-party | ✅ |
| `scripts/common.sh` | multi-delegate → ai-party | ✅ |
| 검수 훅 | `post-delegate-verify.mjs` → `post-agent-verify.mjs` | ✅ |

---

## 체크리스트

### Phase 1 (완료)

- [x] 플러그인 기본 구조 (plugin.json, settings.json, package.json, CLAUDE.md)
- [x] AI 에이전트 정의 (claude-agent.md, gemini-agent.md, codex-agent.md)
- [x] 실행 스크립트 (codex_exec.sh, gemini_exec.sh, common.sh)

### Phase 2 (완료)

- [x] 팀 프리셋 정의 (bugfix, devops, dev-backend, dev-frontend)
- [x] 오케스트레이션 스킬 고도화 (SKILL.md)
- [x] 커맨드 구현 (party, party-team, party-status)
- [x] 에이전트 Team Mode 업데이트
- [x] .party/ Finding Card 구조 (session.json, findings/, approvals/)
