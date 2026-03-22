# 마크다운 출력 템플릿

## _state/ 파일 템플릿

### _state/keywords.md

```markdown
---
type: state
updated: {{YYYY-MM-DD}}
---

# 키워드 상태

## active
| keyword | first_seen | last_seen | hits | source |
|---------|-----------|-----------|------|--------|
| vibe coding | 2026-03-21 | 2026-03-22 | 12 | discovered |
| OpenClaw | 2026-03-21 | 2026-03-22 | 8 | discovered |

## archived
| keyword | first_seen | last_seen | hits | archived_reason |
|---------|-----------|-----------|------|-----------------|
| DGX Spark | 2026-03-19 | 2026-03-20 | 2 | 5일 미출현 |
```

**업데이트 규칙:**
- 매 실행 시 검색에 사용된 active 키워드의 `last_seen`과 `hits` 갱신
- 새 키워드 발견 시 active 테이블에 추가
- `last_seen`이 5일 이상 경과한 active 키워드 → archived로 이동
- active 30개 초과 시 hits 낮은 것부터 archived로 이동
- `updated` 프론트매터 날짜 갱신

### _state/followed.md

```markdown
---
type: state
updated: {{YYYY-MM-DD}}
---

# 팔로우 기록
| handle | followed_date | reason | ai_posts | avg_engagement | followers |
|--------|--------------|--------|----------|----------------|-----------|
| @ClaudeCodeLog | 2026-03-21 | Claude Code 변경사항 자동 추적 | 10+ | 500+ | 15.2K |
| @browser_use | 2026-03-21 | Browser Use 오픈소스 프로젝트 | 5+ | 300+ | 8.5K |
```

### _state/influencers.md

```markdown
---
type: state
updated: {{YYYY-MM-DD}}
---

# 인플루언서 목록

## seed
config.json에서 로드되는 고정 인플루언서:
@emollick, @karpathy, @swyx, @AndrewYNg, @ylecun, ...

## discovered
| handle | discovered_date | source | followers |
|--------|----------------|--------|-----------|
| @simonw | 2026-03-22 | Phase 1 고engagement | 120K |
| @ClaudeCodeLog | 2026-03-21 | Phase 0 Following 탭 | 15.2K |
```

---

## Runs 파일 템플릿 (runs/{YYYY-MM-DD-HHmm}.md)

실행별 상세 로그. 벡터화 대상이 아니므로 운영 데이터를 자유롭게 기록한다.

```markdown
---
date: {{YYYY-MM-DD}}
time: "{{HH:mm}}"
type: run
sources: [X]
total_posts: {{수집된 총 포스트 수}}
phases: [main_feed_scan, keyword_search, influencer_timeline, deep_dive, auto_follow]
tags: [run, ai-research]
---

# {{YYYY-MM-DD}} {{HH:mm}} 리서치 실행

## 수집 통계

| Phase | 방법 | 수집량 |
|-------|------|--------|
| Phase 0 | 메인 피드 스캔 | {{count}}개 |
| Phase 1 | 키워드 검색 ({{키워드 목록}}) | {{count}}개 |
| Phase 2 | 인플루언서 ({{핸들 목록}}) | {{count}}개 |
| Phase 3 | 딥다이브 (스레드 전문 {{count}}건) | {{count}}건 |
| Phase 4 | 자동 팔로우 | {{count}}명 |
| **합계** | | **{{total}} 데이터 포인트** |

## 변경 사항

### 신규 생성
- 🆕 [[토픽명]] — {{토픽 설명 1줄}}
- 🆕 [[엔티티명]] — {{엔티티 설명 1줄}}

### 업데이트
- 📝 [[토픽명]] — +{{추가된 항목 수}}건: {{구체적으로 뭐가 추가됐는지 1줄}}
- 📝 [[엔티티명]] — +{{추가된 항목 수}}건: {{구체적으로 뭐가 추가됐는지 1줄}}

### 딥다이브
- 🔍 [[토픽명]] — {{딥다이브 내용 요약}}

## 수집 로그

| # | 출처 | 작성자 | 핵심 내용 (1줄) | ❤️ | 노트 반영 |
|---|------|--------|----------------|-----|----------|
| 1 | Phase 0 | @handle | {{내용 요약}} | {{likes}} | ✅ [[토픽명]] |
| 2 | Phase 1 | @handle | {{내용 요약}} | {{likes}} | ❌ (중요도 낮음) |
| ... | | | | | |

## 새로 팔로우한 계정 (Phase 4)
- 👤 [@handle](https://x.com/handle) — {{사유: AI 관련성 + engagement 근거}}

## 발견된 새 키워드
- `키워드` — {{설명}}

## 발견된 새 인플루언서
- `@handle` (이름) — {{설명, 팔로워 수}}

## Phase 완료 체크리스트
- [x] Phase 0: 메인 피드 스캔 (Following + For you)
- [x] Phase 1: 키워드 검색
- [x] Phase 2: 인플루언서 타임라인
- [x] Phase 3: 딥다이브
- [x] Phase 4: 자동 팔로우
```

## Daily 노트 템플릿 (daily/{YYYY-MM-DD}.md)

하루 통합 요약. **순수 링크 허브** 역할만 한다. 벡터화 대상이 아니므로 토픽/엔티티 내용을 중복 기술하지 않는다.

**금지**: "핵심 뉴스", "오늘의 트렌드" 같은 서술형 설명 섹션. 풍부한 설명은 토픽 노트에만 들어간다.

```markdown
---
date: {{YYYY-MM-DD}}
type: daily
tags: [daily, ai-research]
---

# {{YYYY-MM-DD}}

## 실행 기록
- [[{{YYYY-MM-DD-HHmm}}]] — {{N}}건 수집, 🆕 {{N}}개, 📝 {{N}}개

## 변경 사항

### 신규
🆕 [[토픽명]] — {{1줄}} | 🆕 [[토픽명]] — {{1줄}} | 🆕 [[엔티티명]] — {{1줄}}

### 업데이트
📝 [[토픽명]] — +N건: {{1줄}} | 📝 [[엔티티명]] — +N건: {{1줄}}

### 딥다이브
🔍 [[토픽명]] | 🔍 [[토픽명]]
```

이후 실행 시 daily 노트에 누적 추가:
- `## 실행 기록`에 새 실행 링크 추가
- `## 변경 사항`에 새 Run 섹션 추가 (예: `### Run 2 (14:00)`)
- 같은 토픽이 여러 실행에서 업데이트되면 각각 기록 (추적용)

## 토픽 노트 템플릿 (topics/{topic-name}.md)

```markdown
---
type: topic
topic_type: {{concept|trend|methodology|usecase|debate|policy|terminology}}
created: {{최초 생성일}}
updated: {{마지막 업데이트일}}
tags: [topic, {{topic_type}}, {{관련 태그들}}]
related_entities: [{{관련 엔티티들}}]
---

# {{토픽 제목}}

{{토픽에 대한 1-2줄 설명. 무엇인지, 왜 중요한지.}}

## 타임라인

### {{YYYY-MM-DD}}

**{{포스트 제목/요약}}** ❤️{{likes}}
{{상세 내용 2-3줄}}

> "{{원문 핵심 인용구}}" — {{작성자}}

([원문]({{url}}))

---

**{{다른 포스트 요약}}** ❤️{{likes}}
{{상세 내용}}
([원문]({{url}}))

### {{이전 날짜}}
- {{이전 포스트 요약}}

## 리소스
- [GitHub]({{url}}) — {{stars, 설명}}
- [공식 사이트]({{url}})
- [코스/튜토리얼]({{url}}) — {{제공자, 수준}}
- [논문]({{url}}) — {{제목, 저자}}

## 핵심 인사이트
{{토픽에 대해 축적된 인사이트. 리서치가 쌓일수록 풍부해진다.}}

## 관련
- [[관련토픽1]] | [[관련토픽2]] | [[관련엔티티1]]
```

**프론트매터 필수 필드**: `type`, `topic_type`, `created`, `updated`, `tags`, `related_entities`
기존 파일 업데이트 시 이 필드가 누락되어 있으면 자동으로 보정한다.

토픽 노트가 이미 존재하면:
1. frontmatter의 `updated` 날짜만 갱신 (누락 필드 있으면 보정)
2. `## 타임라인` 아래 최상단에 오늘 날짜 섹션 추가
3. `## 핵심 인사이트`에 새로운 인사이트 있으면 추가
4. `## 관련`에 새 연결 있으면 추가
5. 원문 인용구(`> `)를 타임라인 항목에 포함

## 엔티티 노트 템플릿 (entities/{entity-name}.md)

```markdown
---
type: entity
entity_type: {{company|person|product|repo|paper|dataset|community|event}}
created: {{최초 생성일}}
updated: {{마지막 업데이트일}}
tags: [entity, {{entity_type}}, {{관련 태그들}}]
x_handle: "{{@handle 있으면}}"
url: "{{GitHub URL | 공식 사이트 | arXiv 링크 있으면}}"
---

# {{엔티티 이름}}

{{엔티티에 대한 1-2줄 설명. 소속, 역할, 전문 분야. 왜 주목하는지.}}

## 타임라인

### {{YYYY-MM-DD}}
- {{관련 포스트 요약}} ([원문]({{url}})) ❤️{{likes}}

## 주요 활동/제품
{{엔티티의 AI 관련 주요 활동이나 제품 목록}}

## 관련
- [[관련토픽1]] | [[관련엔티티1]]
```

**프론트매터 필수 필드**: `type`, `entity_type`, `created`, `updated`, `tags`, `x_handle`, `url`
기존 파일 업데이트 시 이 필드가 누락되어 있으면 자동으로 보정한다.

**최소 품질 기준** (미달 시 생성하지 않는다):
- 1-2줄 설명 (소속, 역할, 전문 분야)
- X 핸들 + 팔로워 수
- 왜 주목하는지 1줄
- 타임라인 최소 1건 (원문 링크 포함)

엔티티 노트도 토픽과 동일하게 기존 노트가 있으면 타임라인에 추가, 없으면 새로 생성.

## _index.md 템플릿

```markdown
---
type: index
tags: [ai-research, index]
updated: {{마지막 업데이트일}}
---

# AI Research Index

## 최근 리서치

| 날짜 | 포스트 | 핵심 토픽 |
|------|--------|-----------|
| [[{{YYYY-MM-DD}}]] | {{count}} | [[토픽1]], [[토픽2]] |

## 활성 토픽
- [[토픽1]] - {{1줄 설명}}
- [[토픽2]] - {{1줄 설명}}

## 주요 엔티티
### 기업 (company)
- [[기업1]] - {{1줄 설명}}

### 인물 (person)
- [[인물1]] - {{1줄 설명}}

### 오픈소스 (repo)
- [[레포1]] - {{1줄 설명}}

### 논문 (paper)
- [[논문1]] - {{1줄 설명}}

### 이벤트 (event)
- [[이벤트1]] - {{1줄 설명}}

## 데일리 노트
- [[daily/{{YYYY-MM-DD}}]] — {{핵심 토픽 나열}}
```

**_index.md 업데이트 규칙:**
- 최근 리서치 테이블 최상단에 오늘 추가
- 새 토픽/엔티티 있으면 목록에 추가
- **키워드, 팔로우 목록은 여기에 나열하지 않음** → `_state/`에서 관리
- "데일리 노트" 섹션은 **1개만 유지** (중복 금지)

## Wikilink 규칙

- 파일명은 영문 케밥케이스: `claude-code.md`, `ethan-mollick.md`
- 한글 토픽도 영문으로: "AI 에이전트" → `ai-agent.md`
- wikilink는 파일명만: `[[claude-code]]`, `[[nvidia]]`
- daily 노트에서 토픽/엔티티 참조 시 반드시 wikilink 사용
- 토픽/엔티티 노트에서 서로 참조 시 반드시 wikilink 사용
- runs 파일에서도 wikilink 사용 (daily에서 runs 링크, runs에서 토픽 링크)
- 이렇게 해야 Obsidian 그래프 뷰에서 지식 네트워크가 형성됨
