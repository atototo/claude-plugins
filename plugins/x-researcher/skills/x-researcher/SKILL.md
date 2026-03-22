---
name: x-researcher
description: X(트위터)와 Threads에서 최신 AI 트렌드를 자동 리서치하여 Obsidian 마크다운 문서로 정리하는 스킬. "AI 리서치", "X에서 트렌드 찾아줘", "최신 AI 소식", "AI 뉴스 정리", "트위터 AI 동향", "Threads AI", "리서치 자동화", "AI 트렌드 수집" 등의 요청 시 트리거. 스케줄 자동 실행과 수동 실행 모두 지원. AI/ML 관련 소셜 미디어 리서치가 필요한 모든 상황에서 이 스킬을 사용하라.
---

# X-Researcher: AI 트렌드 자동 리서치 & Obsidian 문서화

X(트위터)와 Threads에서 최신 AI 콘텐츠를 브라우저 자동화로 수집하고, Obsidian vault에 **토픽+엔티티 기반** 마크다운 문서로 자동 정리한다. `[[wikilink]]`와 YAML frontmatter로 구조화하여 벡터 DB / RAG 파이프라인에 활용 가능.

## ⚠️ 파일 쓰기 규칙 (필수)

- **파일 쓰기는 반드시 Write/Edit 툴을 사용한다. `cat >>`, `echo >>` 등 Bash heredoc/리다이렉션으로 파일에 쓰지 않는다.**
- **디렉토리 생성은 `mkdir`만 단독으로 사용한다. `mkdir ... && echo` 처럼 `&&`로 다른 명령과 결합하지 않는다.**

## ⚠️ 언어 규칙 (필수)

**모든 출력 파일은 반드시 한국어(Korean)로 작성한다.** 이것은 가장 중요한 규칙이다.

- 토픽 노트, 엔티티 노트, 데일리 노트, 런 파일, _index.md — 전부 한국어
- 섹션 제목: `## 타임라인`, `## 리소스`, `## 핵심 인사이트`, `## 관련`, `## 수집 통계`, `## 변경 사항` 등 한국어 사용
- 영어 원문 인용구(`> `)와 기술 용어(API 이름, CLI 명령어, GitHub URL 등)만 영어 유지
- 파일명은 영어 kebab-case 유지 (예: `claude-code.md`, `ai-agent.md`)
- YAML frontmatter의 key는 영어, value 중 설명은 한국어 가능

## ⚠️ 날짜/시간 규칙 (필수)

모든 날짜와 시간은 **한국 시간(KST, UTC+9)** 기준으로 기록한다.

- 파일명: `runs/2026-03-22-0900.md` → KST 09:00
- 데일리 노트: `daily/2026-03-22.md` → KST 기준 날짜
- 프론트매터 date/created/updated: KST 기준 날짜
- 포스트 날짜 필터: "오늘/어제"도 KST 기준

**현재 시간 확인**: 실행 시작 시 `javascript_tool`로 아래 코드를 실행하여 정확한 로컬 시간을 확보한다:
```javascript
new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})
```
이 시간을 기준으로 파일명, 날짜 필터, 프론트매터를 결정한다.

## 설정과 상태 — 분리 구조

설정(변하지 않는 것)과 상태(매 실행마다 변하는 것)를 분리하여 관리한다.

### 설정 파일 (Read only): `~/.claude/x-researcher-config.json`

**이 파일은 읽기만 하고 절대 수정하지 않는다.** 사용자가 직접 편집하는 파일.

```json
{
  "obsidian_vault_path": "~/Documents/AI-Knowledge",
  "research_folder": "AI-Research",
  "sources": ["x", "threads"],
  "keywords": {
    "core": ["LLM", "GPT", "Claude", "AI agent", "multimodal", "RAG", "fine-tuning", "reasoning", "MCP", "AI coding"]
  },
  "influencers": [
    "@emollick", "@karpathy", "@swyx", "@AndrewYNg", "@ylecun"
  ],
  "trusted_follows": {
    "auto_follow": true,
    "follow_threshold": { "min_ai_posts": 3, "min_avg_engagement": 100, "min_followers": 5000 }
  },
  "max_posts_per_keyword": 15,
  "deep_dive_threshold": 50,
  "language_filter": ["en", "ko"],
  "min_engagement": 10
}
```

설정 파일이 없으면 첫 실행 시 사용자에게 vault 경로와 커스텀 키워드를 물어서 생성한다.

### 상태 파일 (Read/Write): `{vault_path}/_state/`

매 실행마다 업데이트되는 런타임 데이터. vault에 저장하여 Obsidian에서 직접 확인/편집 가능.

- `_state/keywords.md` — discovered 키워드 + category/last_seen/hits
- `_state/followed.md` — 팔로우 기록 + 날짜/사유
- `_state/influencers.md` — 자동 발견된 인플루언서 목록

상세 구조와 키워드 lifecycle은 references/analysis.md, 템플릿은 references/templates.md 참조.

**vault 접근 불가 시 fallback**: `~/.claude/x-researcher-state.json`에 동일 데이터를 JSON으로 저장. 다음에 vault 접근 가능해지면 `_state/` 파일로 자동 마이그레이션.

### 마이그레이션 (config.json 구버전 호환)

config.json에 `keywords.discovered`나 `trusted_follows.followed`가 남아있으면 (v1.1.x 이전):
1. `_state/keywords.md`가 없으면 → discovered 키워드를 active 카테고리로 이전하여 생성
2. `_state/followed.md`가 없으면 → followed 목록을 이전하여 생성
3. config.json은 수정하지 않음 (Read only) — 이전 필드는 무시

## 출력 구조

상세는 references/output-structure.md 참조.

```
{vault_path}/{research_folder}/
├── _state/      ❌ 벡터화 제외 — 런타임 상태 (키워드, 팔로우, 인플루언서)
├── topics/      ✅ 벡터화 대상 — 주제별 누적 노트
├── entities/    ✅ 벡터화 대상 — 회사/인물별 노트
├── daily/       ❌ 벡터화 제외 — 하루 요약 (순수 링크 허브)
├── runs/        ❌ 벡터화 제외 — 실행별 상세 로그
└── _index.md    ❌ 벡터화 제외 — 전체 인덱스
```

## 실행 워크플로우

### 0단계: 브라우저 & 로그인 확인

1. `tabs_context_mcp(createIfEmpty: true)` 호출
2. `javascript_tool`로 KST 현재 시간 확인 (날짜/시간 규칙 참조)
3. `navigate`로 `x.com` → 3초 대기 → URL 확인
   - `x.com/home` → 로그인 OK
   - `x.com/i/flow/login` → 수동: 로그인 안내 후 중단 / 자동: WebSearch 폴백

### 1단계: 설정 로드 & 상태 초기화

1. `~/.claude/x-researcher-config.json` 읽기 (없으면 생성)
2. `_state/`, `daily/`, `topics/`, `entities/`, `runs/` 디렉토리 확인/생성
3. `_state/keywords.md` 읽기 → core + active 키워드 목록 구성
4. `_state/followed.md` 읽기 → 이미 팔로우한 계정 목록 로드
5. `_state/influencers.md` 읽기 → 인플루언서 목록 구성 (config seed + discovered)
6. 마이그레이션 필요 시 실행 (위 마이그레이션 섹션 참조)

### 2단계: 5-Phase 탐색으로 X 리서치

**기술 참고:** X는 SPA라서 `document_idle`을 정상 보고하지 않는다. **모든 데이터 추출은 `javascript_tool`로 직접 DOM에서** 한다. (references/scraping.md 참조)

각 Phase의 상세 절차는 references/phases.md 참조.

| Phase | 목적 | 요약 |
|-------|------|------|
| **0: 메인 피드** | 유기적 발견 | **Following + For you 탭 모두** 스캔, 키워드화되지 않은 트렌드 포착 |

> **포스트 날짜 필터**: 각 포스트의 작성 일자를 확인하여 **오늘 또는 어제**(KST 기준) 포스트만 수집한다. 그 이전 포스트는 수집하지 않는다. 크로스 실행 중복 제거(4단계)로 이미 처리된 어제 포스트는 자동으로 제외된다.

| Phase | 목적 | 요약 |
|-------|------|------|
| **1: 키워드 검색** | 넓게 훑기 | core + active 키워드로 `min_faves` 검색, 포스트 전문+engagement 수집 |
| **2: 인플루언서** | 깊게 보기 | 인플루언서 타임라인 직접 방문, 신규 인플루언서 자동 발견 |
| **3: 딥다이브** | 가치 생성 | 고반응 포스트의 스레드/리플라이/외부링크 **필수 수집**(WebFetch)/미디어 깊이 탐색. **이 단계가 토픽 노트의 학습 가능성을 결정** |
| **4: 자동 팔로우** | 피드 확장 | 기준 충족 계정 팔로우 → 다음 실행에서 피드 풍부해지는 복리 효과 |

### 3단계: Threads 리서치

1. `threads.net/search`에서 Phase 1과 동일한 키워드 검색
2. DOM 셀렉터가 X와 다르므로 탐색 필요
3. 고반응 포스트 시 Phase 3 딥다이브 적용

### 4단계: 콘텐츠 분석 & 토픽/엔티티 추출

상세는 references/analysis.md 참조.

1. **크로스 실행 중복 제거** — 오늘/어제 runs 파일(`runs/YYYY-MM-DD-*.md`, `runs/YYYY-MM-{DD-1}-*.md`)을 Read로 읽어 이미 수집된 URL 목록을 추출한 뒤, 이번 실행에서 수집한 포스트 중 해당 URL이 포함된 것은 제외한다.
2. **중복 토픽 확인** — 토픽 생성 전 `Glob("topics/*{키워드}*")`로 유사 파일 존재 확인. 있으면 기존 파일 업데이트.
3. **토픽/엔티티 식별** — 독립 토픽 생성 기준 적용
4. **중요도 정렬** (engagement 기준)
5. **수집 로그 작성** — 전체 포스트를 runs 파일에 테이블로 기록 (유실 방지)
6. **키워드 피드백 루프** — 새 용어 발견 시 `_state/keywords.md`의 active에 추가
7. **키워드 정리** — 5일 미출현 active 키워드를 archived로 이동, active 상한 30개 유지

### 5단계: Obsidian 마크다운 생성/업데이트

상세는 references/output-structure.md, 템플릿은 references/templates.md 참조.

1. **runs 파일 생성** — `runs/{YYYY-MM-DD-HHmm}.md` (수집 로그, 통계, 운영 데이터)
2. **daily 노트 생성/업데이트** — **순수 링크 허브**: wikilink + 1줄 요약만. 서술형 설명이나 "핵심 뉴스" 섹션 금지 (벡터 오염 방지). **기존 파일이 있으면 덮어쓰지 말고 Edit 툴로 하단에 append**
3. **토픽 노트 업데이트/생성** — 타임라인 누적, 원문 인용구(`> `) 포함, **`## 리소스` 섹션 필수** (GitHub/공식사이트/논문/코스 링크), 학습 가능한 수준의 구체적 설명. **기존 파일 업데이트 시 프론트매터가 불완전하면 자동 보정** (type, topic_type, created, updated 필수)
4. **엔티티 노트 업데이트/생성** — 타임라인 누적. **최소 품질 기준**: 1-2줄 설명(소속/역할/전문분야), X 핸들+팔로워 수, 주목 사유 1줄, 타임라인 1건+(원문 링크). **기존 파일 업데이트 시 프론트매터 자동 보정**
5. **_index.md 업데이트** — 키워드 트래킹, 팔로우 목록은 `_state/`에서 관리하므로 _index.md에 나열하지 않음
6. **`_state/` 업데이트** — keywords.md (hits/last_seen 갱신, 새 키워드 추가), followed.md (새 팔로우 추가), influencers.md (새 발견 추가)

### 6단계: 완료 보고

수동 실행 시 요약: 수집 포스트 수, 신규/업데이트 노트, 핵심 하이라이트 3-5개.

## 스케줄 자동 실행

scheduled task와 연동 가능. 권장: 매일 오전 9시 (평일) `0 9 * * 1-5`

## 에러 처리

- **브라우저 미연결**: Chrome + 확장 확인 안내
- **로그인 만료**: 수동→재로그인 안내 / 자동→WebSearch 폴백 + 알림
- **"still loading" 에러**: `javascript_tool`로 직접 DOM 접근
- **스크롤 무반응**: 3회 시도 후 현재 수집분으로 진행
- **레이트 리밋**: 키워드 간 3초 딜레이, 초과 시 수집분만 저장
- **CAPTCHA/봇 감지**: 즉시 중단, 수동 해결 요청. 절대 우회 안 함
- **vault 접근 불가**: `~/.claude/x-researcher-state.json` fallback 사용, 다음 접근 가능 시 마이그레이션

## 제한사항

- 로그인된 Chrome 세션 필요 (만료 시 WebSearch 폴백)
- 키워드당 약 10-15초, X 무한스크롤로 키워드당 최대 ~15-20개 수집
- X/Threads UI 변경 시 DOM 셀렉터 업데이트 필요
