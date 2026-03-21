# Obsidian 출력 구조 상세

## 디렉토리 구조

```
{vault_path}/{research_folder}/
├── topics/                         # 주제별 누적 노트 ✅ 벡터화 대상
│   ├── claude-code.md
│   ├── ai-agent.md
│   └── ai-coding-tools.md
├── entities/                       # 회사/인물별 노트 ✅ 벡터화 대상
│   ├── anthropic.md
│   ├── nvidia.md
│   └── ethan-mollick.md
├── daily/                          # 하루 요약 (링크 허브) ❌ 벡터화 제외
│   ├── 2026-03-20.md
│   └── 2026-03-21.md
├── runs/                           # 실행별 상세 로그 ❌ 벡터화 제외
│   ├── 2026-03-20-0900.md
│   ├── 2026-03-20-1400.md
│   └── 2026-03-21-0900.md
└── _index.md                       # 전체 인덱스 ❌ 벡터화 제외
```

## 벡터화 전략

- `topics/`와 `entities/`만 벡터화 대상. 풍부한 컨텍스트+인용구+타임라인 → RAG 적중률 높음
- `daily/`, `runs/`, `_index.md`는 벡터화 제외. 얕은 요약이 토픽 노트와 경쟁하면 **벡터 오염** 발생
- **Obsidian Smart Connections**: Settings → Smart Environment → Excluded folders에 `daily/`, `runs/` 추가
- **외부 RAG 파이프라인**: `topics/`와 `entities/` 폴더만 로드

## daily vs runs 역할 분리

### daily/ (하루 요약 — 링크 허브)

**역할**: "오늘 뭐가 바뀌었나" 한눈에 보는 뷰. Obsidian Daily Notes 플러그인과 호환.

**규칙:**
- wikilink만 나열, 설명 텍스트 최소화 (벡터 오염 방지)
- 하루 첫 실행 시 새로 생성, 이후 실행은 누적 추가
- 각 실행은 runs 파일로 링크

**구조:**
```markdown
## 실행 기록
- [[2026-03-20-0900]] — 48건 수집, 🆕 3개, 📝 2개
- [[2026-03-20-1400]] — 35건 수집, 🆕 1개, 📝 4개

## 변경 사항
### Run 1 (09:00)
🆕 [[토픽A]] | 🆕 [[토픽B]]
📝 [[토픽C]] — +3건

### Run 2 (14:00)
📝 [[토픽A]] — +2건
🆕 [[토픽D]]
```

### runs/ (실행별 상세 로그)

**역할**: 개별 실행의 전체 기록. 디버깅, 추적, 재분석 용도.

**규칙:**
- 파일명: `{YYYY-MM-DD-HHmm}.md`
- 벡터화 대상 아니므로 운영 메타데이터 자유롭게 포함
- 수집 로그 테이블 (전체 포스트 기록), 수집 통계, 팔로우 기록, 발견된 키워드

## 토픽 노트 규칙

- **기존 노트가 있으면 업데이트, 없으면 새로 생성**
- `## 타임라인` 아래에 날짜별 섹션을 추가하는 방식으로 누적
- frontmatter `updated` 날짜 갱신
- 반드시 관련 엔티티/토픽에 `[[wikilink]]` 연결
- 원문 인용구(`> `)를 포함하여 RAG 적중률 향상 (references/analysis.md 참조)
- 독립 토픽 생성 기준은 references/analysis.md 참조

## 엔티티 노트 규칙

- 토픽과 동일하게 타임라인 누적 방식
- `entity_type`: company, person, product 중 하나
- 인물은 X 핸들, 소속, 팔로워 수 기록
- AI 관련 인물만 엔티티 노트 생성

## _index.md 규칙

- 매 실행 시 업데이트
- 최근 리서치 테이블에 실행 기록 추가
- 새 토픽/엔티티가 있으면 목록에 추가

## Wikilink 규칙

- 파일명은 영문 케밥케이스: `claude-code.md`, `ethan-mollick.md`
- 한글 토픽도 영문으로: "AI 에이전트" → `ai-agent.md`
- wikilink는 파일명만: `[[claude-code]]`, `[[nvidia]]`
- daily에서 토픽/엔티티 참조 시 반드시 wikilink
- 토픽/엔티티 간 서로 참조 시 반드시 wikilink
- runs에서도 wikilink 사용 (daily→runs, runs→토픽)

## 템플릿

구체적 마크다운 템플릿은 references/templates.md 참조.
