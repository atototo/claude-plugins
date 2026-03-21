---
name: x-researcher
description: X(트위터)와 Threads에서 최신 AI 트렌드를 자동 리서치하여 Obsidian 마크다운 문서로 정리하는 스킬. "AI 리서치", "X에서 트렌드 찾아줘", "최신 AI 소식", "AI 뉴스 정리", "트위터 AI 동향", "Threads AI", "리서치 자동화", "AI 트렌드 수집" 등의 요청 시 트리거. 스케줄 자동 실행과 수동 실행 모두 지원. AI/ML 관련 소셜 미디어 리서치가 필요한 모든 상황에서 이 스킬을 사용하라.
---

# X-Researcher: AI 트렌드 자동 리서치 & Obsidian 문서화

X(트위터)와 Threads에서 최신 AI 콘텐츠를 브라우저 자동화로 수집하고, Obsidian vault에 **토픽+엔티티 기반** 마크다운 문서로 자동 정리한다. `[[wikilink]]`와 YAML frontmatter로 구조화하여 벡터 DB / RAG 파이프라인에 활용 가능.

## ⚠️ 언어 규칙 (필수)

**모든 출력 파일은 반드시 한국어(Korean)로 작성한다.** 이것은 가장 중요한 규칙이다.

- 토픽 노트, 엔티티 노트, 데일리 노트, 런 파일, _index.md — 전부 한국어
- 섹션 제목: `## 타임라인`, `## 리소스`, `## 핵심 인사이트`, `## 관련`, `## 수집 통계`, `## 변경 사항` 등 한국어 사용
- 영어 원문 인용구(`> `)와 기술 용어(API 이름, CLI 명령어, GitHub URL 등)만 영어 유지
- 파일명은 영어 kebab-case 유지 (예: `claude-code.md`, `ai-agent.md`)
- YAML frontmatter의 key는 영어, value 중 설명은 한국어 가능

## 설정

**설정 파일**: `~/.claude/x-researcher-config.json`

```json
{
  "obsidian_vault_path": "~/Documents/AI-Knowledge",
  "research_folder": "AI-Research",
  "sources": ["x", "threads"],
  "keywords": {
    "default": ["LLM", "GPT", "Claude", "AI agent", "multimodal", "RAG", "fine-tuning", "reasoning", "MCP", "AI coding"],
    "custom": [],
    "discovered": []
  },
  "influencers": [
    "@emollick", "@kaboronevsky", "@swyx", "@AndrewYNg", "@ylecun",
    "@masahirochaen", "@ai_and_humans"
  ],
  "trusted_follows": {
    "auto_follow": true,
    "follow_threshold": { "min_ai_posts": 3, "min_avg_engagement": 100, "min_followers": 5000 },
    "followed": []
  },
  "max_posts_per_keyword": 15,
  "deep_dive_threshold": 50,
  "language_filter": ["en", "ko", "ja"],
  "min_engagement": 10
}
```

설정 파일이 없으면 첫 실행 시 사용자에게 vault 경로와 커스텀 키워드를 물어서 생성한다.

## 출력 구조

상세는 references/output-structure.md 참조.

```
{vault_path}/{research_folder}/
├── topics/      ✅ 벡터화 대상 — 주제별 누적 노트
├── entities/    ✅ 벡터화 대상 — 회사/인물별 노트
├── daily/       ❌ 벡터화 제외 — 하루 요약 (링크 허브)
├── runs/        ❌ 벡터화 제외 — 실행별 상세 로그
└── _index.md    ❌ 벡터화 제외 — 전체 인덱스
```

## 실행 워크플로우

### 0단계: 브라우저 & 로그인 확인

1. `tabs_context_mcp(createIfEmpty: true)` 호출
2. `navigate`로 `x.com` → 3초 대기 → URL 확인
   - `x.com/home` → 로그인 OK
   - `x.com/i/flow/login` → 수동: 로그인 안내 후 중단 / 자동: WebSearch 폴백

### 1단계: 설정 로드 & 디렉토리 확인

1. `~/.claude/x-researcher-config.json` 읽기 (없으면 생성)
2. `daily/`, `topics/`, `entities/`, `runs/` 디렉토리 확인/생성

### 2단계: 5-Phase 탐색으로 X 리서치

**기술 참고:** X는 SPA라서 `document_idle`을 정상 보고하지 않는다. **모든 데이터 추출은 `javascript_tool`로 직접 DOM에서** 한다. (references/scraping.md 참조)

각 Phase의 상세 절차는 references/phases.md 참조.

| Phase | 목적 | 요약 |
|-------|------|------|
| **0: 메인 피드** | 유기적 발견 | **Following + For you 탭 모두** 스캔, 키워드화되지 않은 트렌드 포착 |
| **1: 키워드 검색** | 넓게 훑기 | 각 키워드로 `min_faves` 검색, 포스트 전문+engagement 수집 |
| **2: 인플루언서** | 깊게 보기 | 인플루언서 타임라인 직접 방문, 신규 인플루언서 자동 발견 |
| **3: 딥다이브** | 가치 생성 | 고반응 포스트의 스레드/리플라이/외부링크 **필수 수집**(WebFetch)/미디어 깊이 탐색. **이 단계가 토픽 노트의 학습 가능성을 결정** |
| **4: 자동 팔로우** | 피드 확장 | 기준 충족 계정 팔로우 → 다음 실행에서 피드 풍부해지는 복리 효과 |

### 3단계: Threads 리서치

1. `threads.net/search`에서 Phase 1과 동일한 키워드 검색
2. DOM 셀렉터가 X와 다르므로 탐색 필요
3. 고반응 포스트 시 Phase 3 딥다이브 적용

### 4단계: 콘텐츠 분석 & 토픽/엔티티 추출

상세는 references/analysis.md 참조.

1. **중복 제거** (URL 기준)
2. **토픽/엔티티 식별** — 독립 토픽 생성 기준 적용
3. **중요도 정렬** (engagement 기준)
4. **수집 로그 작성** — 전체 포스트를 runs 파일에 테이블로 기록 (유실 방지)
5. **키워드 피드백 루프** — 새 용어 발견 시 `keywords.discovered`에 추가

### 5단계: Obsidian 마크다운 생성/업데이트

상세는 references/output-structure.md, 템플릿은 references/templates.md 참조.

1. **runs 파일 생성** — `runs/{YYYY-MM-DD-HHmm}.md` (수집 로그, 통계, 운영 데이터)
2. **daily 노트 생성/업데이트** — 링크 허브, wikilink만, 벡터 오염 방지
3. **토픽 노트 업데이트/생성** — 타임라인 누적, 원문 인용구(`> `) 포함, **`## 리소스` 섹션 필수** (GitHub/공식사이트/논문/코스 링크), 학습 가능한 수준의 구체적 설명
4. **엔티티 노트 업데이트/생성** — 타임라인 누적
5. **_index.md 업데이트**

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

## 제한사항

- 로그인된 Chrome 세션 필요 (만료 시 WebSearch 폴백)
- 키워드당 약 10-15초, X 무한스크롤로 키워드당 최대 ~15-20개 수집
- X/Threads UI 변경 시 DOM 셀렉터 업데이트 필요
