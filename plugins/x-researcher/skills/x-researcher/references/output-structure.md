# Obsidian 출력 구조 상세

## 디렉토리 구조

```
{vault_path}/{research_folder}/
├── _state/                        # 런타임 상태 ❌ 벡터화 제외
│   ├── keywords.md                # discovered 키워드 lifecycle
│   ├── followed.md                # 팔로우 기록
│   └── influencers.md             # 자동 발견 인플루언서
├── topics/                        # 주제별 누적 노트 ✅ 벡터화 대상
│   ├── claude-code.md
│   ├── ai-agent.md
│   └── ai-coding-tools.md
├── entities/                      # 회사/인물별 노트 ✅ 벡터화 대상
│   ├── anthropic.md
│   ├── nvidia.md
│   └── ethan-mollick.md
├── daily/                         # 하루 요약 (순수 링크 허브) ❌ 벡터화 제외
│   ├── 2026-03-20.md
│   └── 2026-03-21.md
├── runs/                          # 실행별 상세 로그 ❌ 벡터화 제외
│   ├── 2026-03-20-0900.md
│   ├── 2026-03-20-1400.md
│   └── 2026-03-21-0900.md
└── _index.md                      # 전체 인덱스 ❌ 벡터화 제외
```

## 벡터화 전략

- `topics/`와 `entities/`만 벡터화 대상. 풍부한 컨텍스트+인용구+타임라인 → RAG 적중률 높음
- `_state/`, `daily/`, `runs/`, `_index.md`는 벡터화 제외. 얕은 요약이 토픽 노트와 경쟁하면 **벡터 오염** 발생
- **Obsidian Smart Connections**: Settings → Smart Environment → Excluded folders에 `_state/`, `daily/`, `runs/` 추가
- **외부 RAG 파이프라인**: `topics/`와 `entities/` 폴더만 로드

## _state/ (런타임 상태)

**역할**: 설정(config.json)과 분리된 런타임 데이터. 매 실행마다 업데이트된다.

**규칙:**
- config.json은 **Read only** — 절대 수정하지 않는다
- 키워드, 팔로우, 인플루언서 등 실행 중 변하는 데이터는 모두 `_state/`에 저장
- 마크다운 테이블 형태라 Obsidian에서 직접 확인/편집 가능
- vault 접근 불가 시 `~/.claude/x-researcher-state.json`에 fallback 저장

**파일 목록:**
- `keywords.md` — active/archived 키워드 + last_seen, hits 메타데이터
- `followed.md` — 자동 팔로우 기록 + 날짜, 사유
- `influencers.md` — seed(config) + discovered 인플루언서 목록

상세 구조는 references/templates.md 참조.

## daily vs runs 역할 분리

### daily/ (하루 요약 — 순수 링크 허브)

**역할**: "오늘 뭐가 바뀌었나" 한눈에 보는 뷰. Obsidian Daily Notes 플러그인과 호환.

**규칙:**
- **순수 링크 허브**: wikilink + 1줄 요약만 허용
- "핵심 뉴스", "오늘의 트렌드" 같은 **서술형 설명 섹션 금지** — 벡터 오염 방지. 풍부한 설명은 토픽 노트에만 들어간다.
- 하루 첫 실행 시 새로 생성, 이후 실행은 누적 추가
- 각 실행은 runs 파일로 링크

**허용되는 형태:**
```markdown
## 변경 사항
### Run 1 (09:00)
🆕 [[topic-a]] — AI 코딩 도구 비교 | 🆕 [[topic-b]] — 새 MCP 서버
📝 [[topic-c]] — +3건: Karpathy 논의 추가
```

**금지되는 형태:**
```markdown
## 🔥 핵심 뉴스
### Claude Code 생태계
- **Claude Code 2.1.81 릴리스** — `--bare` 플래그 추가...  ← 이런 설명은 토픽 노트에!
```

### runs/ (실행별 상세 로그)

**역할**: 개별 실행의 전체 기록. 디버깅, 추적, 재분석 용도.

**규칙:**
- 파일명: `{YYYY-MM-DD-HHmm}.md` (KST 기준)
- 벡터화 대상 아니므로 운영 메타데이터 자유롭게 포함
- 수집 로그 테이블 (전체 포스트 기록), 수집 통계, 팔로우 기록, 발견된 키워드

## 토픽 노트 규칙

- **기존 노트가 있으면 업데이트, 없으면 새로 생성**
- **생성 전 중복 확인 필수**: `Glob("topics/*{키워드}*")` 실행하여 유사 파일 존재 여부 확인. 있으면 기존 파일 업데이트. `browser-use-cli-2.md` 같은 번호 붙이기 금지.
- `## 타임라인` 아래에 날짜별 섹션을 추가하는 방식으로 누적
- frontmatter `updated` 날짜 갱신
- 반드시 관련 엔티티/토픽에 `[[wikilink]]` 연결
- 원문 인용구(`> `)를 포함하여 RAG 적중률 향상 (references/analysis.md 참조)
- 독립 토픽 생성 기준은 references/analysis.md 참조

**프론트매터 필수 필드** (기존 파일 업데이트 시 누락 필드 자동 보정):
```yaml
---
type: topic
topic_type: concept|trend|methodology|usecase|debate|policy|terminology
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [topic, {topic_type}, ...]
related_entities: [...]
---
```

## 엔터티 노트 규칙

- 토픽과 동일하게 타임라인 누적 방식
- `entity_type`: company, person, product, repo, paper, dataset, community, event
- AI 관련 인물만 엔티티 노트 생성

**최소 품질 기준** (이 기준 미달인 엔터티 노트는 생성하지 않는다):
- 1-2줄 설명 (소속, 역할, 전문 분야)
- X 핸들 + 팔로워 수
- 왜 주목하는지 1줄
- 타임라인 최소 1건 (원문 링크 포함)

**프론트매터 필수 필드** (기존 파일 업데이트 시 누락 필드 자동 보정):
```yaml
---
type: entity
entity_type: company|person|product|repo|paper|dataset|community|event
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [entity, {entity_type}, ...]
x_handle: "@..."
url: "..."
---
```

## _index.md 규칙

- 매 실행 시 업데이트
- 최근 리서치 테이블에 실행 기록 추가
- 새 토픽/엔티티가 있으면 목록에 추가
- **키워드 트래킹은 `_state/keywords.md`에서 관리** — _index.md에 키워드 목록 나열하지 않음
- **팔로우 목록은 `_state/followed.md`에서 관리** — _index.md에 팔로우 계정 나열하지 않음
- "데일리 노트" 섹션은 1개만 유지 (중복 금지)

## Wikilink 규칙

- 파일명은 영문 케밥케이스: `claude-code.md`, `ethan-mollick.md`
- 한글 토픽도 영문으로: "AI 에이전트" → `ai-agent.md`
- wikilink는 파일명만: `[[claude-code]]`, `[[nvidia]]`
- daily에서 토픽/엔티티 참조 시 반드시 wikilink
- 토픽/엔티티 간 서로 참조 시 반드시 wikilink
- runs에서도 wikilink 사용 (daily→runs, runs→토픽)

## 템플릿

구체적 마크다운 템플릿은 references/templates.md 참조.
