# Phase 3.5: v0.8 → v0.9 역할 기반 전환

> ai-party 에이전트 아키텍처를 "AI 유닛 기반"에서 "역할 기반 + 도구 위임"으로 전환.
> Phase 3 실행 엔진 신뢰성 확보 후, Phase 4 AI OPS Platform 진입 전 구조 정비.
> 관련: [index.md](index.md) | 이전 ← [phase3.md](phase3.md) | 다음 → [phase4-6.md](phase4-6.md)

---

## 1. 왜 바꾸는가

### 근본 문제: 3버전 반복 패치

v0.8.16~v0.8.18 동안 codex-agent/gemini-agent 관련 문제가 반복됐다:

| 버전 | 문제 | 패치 |
|------|------|------|
| v0.8.16 | permission_prompt 5건, validation failed 213건 | pre-tool-auto-approve.mjs 추가 |
| v0.8.17 | claude-haiku model injection, permission 2건 | AGENT_MODEL_MAP 강제 오버라이드, 필드명 수정 |
| v0.8.18 | permission 여전히 1~3건, decision 이중 필드 필요 | decision:"approve" + permissionDecision:"allow" 이중화 |

3버전 연속으로 **증상만 패치**했고, 근본 원인(다른 런타임의 에이전트화)은 해결되지 않았다.

### 핵심 단서: multi-delegate와의 비교

같은 codex/gemini CLI를 multi-delegate 플러그인에서는 안정적으로 사용하고 있었다:

```
multi-delegate (안정): Claude 에이전트 → Bash로 CLI 호출 → 결과 수신 (도구로 사용)
ai-party (불안정):     codex/gemini → 별도 에이전트 타입으로 스폰 → 독립 세션 (에이전트로 사용)
```

**도구로 쓰면 안정, 에이전트로 쓰면 불안정** — 에이전트 레벨의 문제.

### 근본 원인

1. **3가지 런타임**: Claude/Codex/Gemini 각각 다른 권한 모델, 도구 접근 체계, 세션 관리
2. **훅 호환성**: ai-party 훅(enforce, auto-approve 등)이 Claude Code 환경 기준. Codex/Gemini CLI는 훅 체계 밖
3. **디버깅 3배**: 3가지 로그 체계로 문제 추적 비용 증가
4. **Phase 4 장벽**: AI OPS Platform에서 3가지 API 키/인스턴스/에러 핸들링 관리 필요

### 참고: wshobson/agents 검증

[wshobson/agents](https://github.com/wshobson/agents) — 112개 에이전트, **전부 Claude 기반**.
외부 AI를 에이전트로 쓰지 않고, 역할로 에이전트를 정의하며 모델 티어링으로 비용 최적화.
이 접근이 대규모에서도 작동함을 실증.

---

## 2. 무엇이 바뀌는가

### 원칙 변경

```
AS-IS: "AI 유닛 기반" — Claude/Gemini/Codex 각 AI의 강점으로 에이전트 정의
TO-BE: "역할 기반 + 도구 위임" — 역할이 에이전트를 정의, 외부 AI는 도구로 위임
```

### 에이전트 변경: 4개(AI 유닛) → 8개(역할)

| AS-IS | TO-BE | 모델 | 비고 |
|-------|-------|------|------|
| claude-agent | architect | opus | 설계/아키텍처 전담 |
| claude-agent | reviewer | opus | 리뷰/품질 전담 |
| gemini-agent | analyst | sonnet | 분석/스캔 전담 (Claude 직접 수행) |
| codex-agent | builder | sonnet | 구현/수정 전담 (Claude 직접 수행) |
| — | security-auditor | opus | 신규: 보안 감사 |
| — | researcher | sonnet | 신규: 기술 조사 |
| — | deployer | sonnet | 신규: 배포/인프라 |
| leader-agent | leader | opus | 이름 변경 (leader-agent → leader) |

### 모델 티어링

| Tier | Model | 역할 | 근거 |
|------|-------|------|------|
| T1 (Critical) | opus | architect, reviewer, security-auditor, leader | 깊은 추론, 판단, 보안 분석 |
| T2 (Standard) | sonnet | analyst, builder, researcher, deployer | 실행/분석, 비용 효율 |
| T3 (Fast) | haiku | (미래) 단순 포맷팅, 데이터 변환 | 저비용 반복 작업 |

### 팀 변경: 4개 → 10개

| 팀 | 변경 | 구성 | 트리거 |
|----|------|------|--------|
| bugfix | 수정 | analyst + architect + builder + reviewer | error, exception, NPE, bug |
| devops | 수정 | analyst + architect + deployer + reviewer | k8s, resource, deploy, helm |
| dev-backend | 수정 | architect + builder + reviewer | api, endpoint, service, backend |
| dev-frontend | 수정 | architect + builder + reviewer | component, UI, responsive |
| **review** | 신규 | reviewer ×3 (보안/성능/아키텍처 병렬) | review, 리뷰, PR |
| **security** | 신규 | security-auditor ×2 + analyst + architect | security, 보안, vulnerability |
| **feature** | 신규 | analyst + architect + builder ×2 + reviewer | feature, 기능, implement |
| **fullstack** | 신규 | architect + builder ×2 + deployer + reviewer | fullstack, 풀스택 |
| **research** | 신규 | researcher ×2 + architect | research, 조사, investigate |
| **migration** | 신규 | analyst + architect + builder ×2 + reviewer | migration, upgrade, refactor |

### 팀별 워크플로우 패턴

팀마다 상태 머신 phase 시퀀스가 다르다:

| 팀 | Phase 시퀀스 | 패턴 |
|----|------------|------|
| bugfix, feature, migration | CONTEXTUALIZING → ANALYZING → PLANNING → EXECUTING → REVIEWING | 전체 파이프라인 |
| devops | CONTEXTUALIZING → ANALYZING → PLANNING → EXECUTING → REVIEWING | 전체 파이프라인 |
| dev-backend, dev-frontend | CONTEXTUALIZING → PLANNING → EXECUTING → REVIEWING | ANALYZING 건너뜀 |
| review | CONTEXTUALIZING → ANALYZING → REVIEWING | 구현 없음, 병렬 리뷰 |
| security | CONTEXTUALIZING → ANALYZING → PLANNING → REVIEWING | 구현 없음 |
| research | CONTEXTUALIZING → ANALYZING → PLANNING | 구현 없음, 보고서 |
| fullstack | CONTEXTUALIZING → PLANNING → EXECUTING → REVIEWING | 병렬 구현 |

### Layer 구조 변경

```
AS-IS:
  Layer 1: AI 에이전트 유닛 (claude-agent, gemini-agent, codex-agent, leader-agent)
  Layer 0: 실행 도구 (codex_exec.sh, gemini_exec.sh)

TO-BE:
  Layer 1: 역할 에이전트 (analyst, architect, builder, reviewer, security-auditor, researcher, deployer, leader)
  Layer 0: 도구 위임 (multi-delegate 스킬 또는 Bash 경유, 선택적)
```

### 상태 머신 확장

```
AS-IS: IDLE → ANALYZING → PLANNING → EXECUTING → REVIEWING → AWAITING_APPROVAL
TO-BE: IDLE → CONTEXTUALIZING → ANALYZING → PLANNING → EXECUTING → REVIEWING → AWAITING_APPROVAL
```

CONTEXTUALIZING: Leader의 Conductor Context Phase. 프로젝트 컨텍스트 수집 후 워커에 배포.
(wshobson/agents의 Conductor 패턴 참고)

### 도구 위임 전략

외부 CLI는 에이전트 정체성이 아닌 **도구**:

| 도구 | 위임 기준 | 방법 |
|------|----------|------|
| Gemini CLI | 1M+ 토큰 초대규모 컨텍스트 분석 | Bash 경유 또는 multi-delegate |
| Codex CLI | 격리 sandbox 실행 | Bash 경유 또는 multi-delegate |
| 기본 | 위 조건 외 모든 경우 | Claude 네이티브 도구 직접 수행 |

### 에이전트 프롬프트: Progressive Disclosure

에이전트 프롬프트를 3-tier로 분리 (토큰 ~40% 절감):

```
agents/
  ├── analyst.md              ← Tier 1: 메타데이터 + 핵심 지침 (항상 로드)
  ├── architect.md
  ├── ...
  └── resources/              ← Tier 3: 템플릿/체크리스트 (필요 시 로드)
      ├── analysis-template.md
      ├── design-template.md
      ├── review-checklist.md
      └── security-checklist.md
```

### 디렉토리 구조 변경

```
AS-IS:                              TO-BE:
agents/                             agents/
  ├── claude-agent.md                 ├── analyst.md         (sonnet)
  ├── gemini-agent.md                 ├── architect.md       (opus)
  ├── codex-agent.md                  ├── builder.md         (sonnet)
  └── leader-agent.md                 ├── reviewer.md        (opus)
                                      ├── security-auditor.md (opus)
                                      ├── researcher.md      (sonnet)
                                      ├── deployer.md        (sonnet)
                                      ├── leader.md          (opus)
                                      ├── resources/
                                      │   └── ...
                                      # deprecated (v1.0.0 삭제 예정)
                                      ├── claude-agent.md
                                      ├── gemini-agent.md
                                      ├── codex-agent.md
                                      └── leader-agent.md

teams/                              teams/
  ├── bugfix.md                       ├── bugfix.md          (수정)
  ├── devops.md                       ├── devops.md          (수정)
  ├── dev-backend.md                  ├── dev-backend.md     (수정)
  └── dev-frontend.md                 ├── dev-frontend.md    (수정)
                                      ├── review.md          (신규)
                                      ├── security.md        (신규)
                                      ├── feature.md         (신규)
                                      ├── fullstack.md       (신규)
                                      ├── research.md        (신규)
                                      └── migration.md       (신규)
```

### .party/ 런타임 변경

```
findings/
  ├── context.md            ← 신규: CONTEXTUALIZING phase 산출물
  ├── analysis.md           ← analyst (was: gemini-agent)
  ├── design.md             ← architect (was: claude-agent)
  ├── implementation.md     ← builder (was: codex-agent)
  └── review.md             ← reviewer (was: claude-agent)
```

### 요구사항 변경

```
AS-IS (필수):                   TO-BE:
  Claude Code CLI                 필수: Claude Code CLI, Node.js 18+, Git 2.x+
  Codex CLI                       선택: Codex CLI (sandbox 위임용)
  Gemini CLI                      선택: Gemini CLI (초대규모 분석 위임용)
  Node.js 18+
  Git 2.x+
```

---

## 3. 어떻게 마이그레이션하는가

### Step 1: 역할 에이전트 파일 생성

```bash
# 새 에이전트 파일 생성
touch agents/{analyst,architect,builder,reviewer,security-auditor,researcher,deployer,leader}.md
mkdir -p agents/resources

# 기존 파일 deprecated 마킹 (삭제하지 않음)
# claude-agent.md, gemini-agent.md, codex-agent.md, leader-agent.md 상단에 deprecated 표시
```

각 에이전트 .md 파일에 역할 정의, 모델, 도구, Phase 매핑을 작성.

### Step 2: 팀 프리셋 수정

기존 4개 팀(bugfix, devops, dev-backend, dev-frontend)의 멤버를 역할 기반으로 변경:

```yaml
# AS-IS (bugfix.md)
gemini-agent as analyst
claude-agent as architect
codex-agent as builder
claude-agent as reviewer

# TO-BE (bugfix.md)
analyst
architect
builder
reviewer
```

### Step 3: 신규 팀 추가

`teams/` 에 6개 파일 추가: review.md, security.md, feature.md, fullstack.md, research.md, migration.md

### Step 4: 훅 수정

| 훅 | 변경 내용 |
|----|----------|
| `pre-tool-agent-inject.mjs` | 역할→모델 매핑 추가 (analyst→sonnet, architect→opus 등) + 하위 호환 유지 |
| `post-team-init.mjs` | teams/*.md 파싱 로직을 역할 기반으로 확장 |
| `auto-delegate.mjs` | 스폰 시 `subagent_type` 결정 로직 변경 (전원 general-purpose 또는 claude-agent) |

### Step 5: 상태 머신 확장

`lib/state-machine.mjs`에 CONTEXTUALIZING 상태 추가:
- IDLE → CONTEXTUALIZING 전이 허용
- CONTEXTUALIZING → ANALYZING 또는 PLANNING 전이 허용 (팀별 starting_phase)

### Step 6: 하위 호환

- 기존 에이전트 파일(claude-agent.md 등)은 deprecated 마킹만, v1.0.0까지 유지
- pre-tool-agent-inject.mjs에서 기존 에이전트명도 계속 인식
- scripts/codex_exec.sh, gemini_exec.sh 유지 (도구 위임용)

---

## 4. 구현 체크리스트

### Phase 3.5-A: 에이전트 전환 (v0.9.0-alpha)

- [ ] 역할 에이전트 8개 .md 파일 생성
- [ ] agents/resources/ 디렉토리 + 템플릿 파일
- [ ] 기존 에이전트 4개 deprecated 마킹
- [ ] pre-tool-agent-inject.mjs 역할→모델 매핑 추가
- [ ] auto-delegate.mjs 스폰 로직 변경

### Phase 3.5-B: 팀 전환 (v0.9.0-beta)

- [ ] 기존 팀 4개 역할 기반으로 수정
- [ ] 신규 팀 6개 파일 생성 (review, security, feature, fullstack, research, migration)
- [ ] post-team-init.mjs 파싱 로직 확장
- [ ] 팀별 trigger_keywords 확장

### Phase 3.5-C: 상태 머신 + Conductor (v0.9.0-rc)

- [ ] CONTEXTUALIZING 상태 추가 (state-machine.mjs)
- [ ] Leader Conductor Context Phase 구현
- [ ] 팀별 워크플로우 패턴 (starting_phase, phase 시퀀스)
- [ ] context.md findings 핸드오프

### Phase 3.5-D: 검증 (v0.9.0)

- [ ] 기존 팀 4개 정상 동작 확인 (하위 호환)
- [ ] 신규 팀 6개 테스트
- [ ] permission_prompt 0건 확인
- [ ] model injection 회귀 없음 확인
- [ ] 도구 위임 (multi-delegate 경유) 테스트

---

## 5. 검증 기준

### 기능 검증

| 항목 | 기준 | 방법 |
|------|------|------|
| 에이전트 스폰 | 8개 역할 모두 정상 스폰 | 각 팀으로 테스트 |
| 모델 매핑 | opus/sonnet 올바르게 주입 | --debug 로그 확인 |
| 팀 선택 | trigger_keywords 매칭 정상 | 각 키워드로 테스트 |
| 하위 호환 | 기존 에이전트명도 인식 | deprecated 에이전트로 직접 스폰 |
| 도구 위임 | Gemini/Codex CLI Bash 경유 | multi-delegate 스킬 테스트 |
| 상태 전이 | CONTEXTUALIZING 포함 전체 흐름 | bugfix 팀 E2E |

### 성능 검증

| 항목 | AS-IS | TO-BE 목표 |
|------|-------|-----------|
| permission_prompt | 1~3건 | 0건 |
| validation failed | 0건 | 0건 유지 |
| model injection | 0건 | 0건 유지 |
| 에이전트 스폰 성공률 | ~90% | 99%+ |

### Phase 4 준비도

| 항목 | 기준 |
|------|------|
| API 키 관리 | Anthropic만 필수 (Codex/Gemini 선택) |
| 인스턴스 관리 | 단일 타입 (Claude) |
| 설정 외부화 | 팀/에이전트 설정이 .md 파일로 분리 |
| 결과 수집 | .party/findings/ 구조 유지 |

---

## 6. Phase 4-6 정합성

### 이 전환이 Phase 4-6에 미치는 영향

| Phase | 영향 | 상세 |
|-------|------|------|
| Phase 4: Platform | **단순화** | 단일 API(Anthropic) → 인증/인스턴스 관리 1/3 |
| Phase 5: Dashboard | **변경 없음** | .party/ 구조 유지, findings 동일 |
| Phase 6: Production | **단순화** | 단일 런타임 → 스케일링/모니터링 단순화 |

### 유지되는 것

- "AI들이 파티 모드로 자율 협업" 비전
- "모든 결정권은 사람에게" 원칙
- 파일 기반 핸드오프 + 시그널 메시징
- 3계층 기계적 강제 (enforce + verify + remind)
- 승인 게이트
- .party/ 런타임 디렉토리 구조

### ai-party 차별점 (wshobson/agents 대비)

1. **3계층 기계적 강제** — 훅으로 도구 접근을 기계적으로 제어 (wshobson에 없음)
2. **필수 승인 게이트** — 모든 변경은 사용자 승인 후 실행 (wshobson에 없음)
3. **상태 머신 + artifact guard** — 파이프라인 상태 전환을 강제 (wshobson에 없음)
4. **도구 위임** — 필요 시 Gemini/Codex CLI를 도구로 활용 (wshobson은 Claude only)

---

## 참고

- [wshobson/agents](https://github.com/wshobson/agents) — 112개 Claude 기반 에이전트, 7개 팀, Conductor 패턴
- [multi-delegate plugin](https://github.com/atototo/claude-plugins) — codex/gemini CLI 도구 위임 선행 구현
- v0.8.16~v0.8.18 디버그 로그 분석 — permission/model injection 반복 패치 이력
