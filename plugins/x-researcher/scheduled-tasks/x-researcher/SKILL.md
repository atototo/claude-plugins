---
name: x-researcher
description: X(트위터)에서 최신 AI 트렌드를 자동 리서치하여 Obsidian vault에 마크다운 문서로 정리
---

X(트위터)에서 최신 AI 트렌드를 리서치하고 Obsidian vault에 한국어로 문서화하라.

## ⚠️ 최우선 규칙
- **모든 출력 파일은 반드시 한국어(Korean)로 작성한다.** 섹션 제목, 설명, 인사이트 전부 한국어.
- 영어 원문 인용구(`> `)와 기술 용어(API 이름, CLI 명령어, URL)만 영어 유지.
- 파일명은 영어 kebab-case (예: `claude-code.md`).
- **파일 쓰기는 반드시 Write/Edit 툴을 사용한다. `cat >>`, `echo >>` 등 Bash heredoc/리다이렉션으로 파일에 쓰지 않는다.**
- **디렉토리 생성은 `mkdir`만 단독으로 사용한다. `mkdir ... && echo` 처럼 `&&`로 다른 명령과 결합하지 않는다.**

## ⚠️ Phase 누락 금지 (필수)
- **Phase 0 ~ Phase 4 전체를 반드시 순서대로 실행한다.** 어떤 Phase도 건너뛰거나 생략하지 않는다.
- 각 Phase 완료 시 runs 파일에 체크포인트를 기록한다: `Phase N 완료 (HH:MM, 수집 N건)`
- 모든 Phase 실행 후 runs 파일 하단에 Phase 완료 체크리스트를 기록한다:
  ```
  ## Phase 완료 체크리스트
  - [x] Phase 0: 메인 피드 스캔 (Following + For you)
  - [x] Phase 1: 키워드 검색
  - [x] Phase 2: 인플루언서 타임라인
  - [x] Phase 3: 딥다이브
  - [x] Phase 4: 자동 팔로우
  ```
- Phase를 하나라도 누락하면 해당 실행은 **불완전 실행**으로 표시한다.

## 실행할 스킬
~/.claude/plugins/marketplaces/atoto-claude-plugins/plugins/x-researcher/skills/x-researcher/SKILL.md 의 지침을 따른다.

## 설정 파일
~/.claude/x-researcher-config.json 을 읽어서 vault 경로, 키워드, 인플루언서 목록을 로드한다.

## 핵심 워크플로우
1. Chrome 브라우저로 x.com 접속 (로그인 상태 확인)
2. 5-Phase 탐색 실행:
   - Phase 0: 메인 피드 스캔 — **Following 탭 + For you 탭 모두** 스캔
   - Phase 1: 키워드 검색 (LLM, Claude, AI agent, MCP, AI coding, RAG, fine-tuning, multimodal + discovered keywords)
   - Phase 2: 인플루언서 타임라인 방문 (@emollick, @AndrewYNg, @ylecun, @masahirochaen, @swyx 등)
   - **포스트 날짜 필터**: 각 포스트의 작성 일자를 확인하여 **오늘 또는 어제** 포스트만 수집한다. 그 이전은 수집하지 않는다.
   - **크로스 실행 중복 제거**: 오늘/어제 runs 파일을 읽어 이미 수집된 URL은 이번 실행에서 제외한다.
   - Phase 3: 고반응 포스트 딥다이브 (스레드/리플라이/외부링크 WebFetch)
   - Phase 4: 기준 충족 계정 자동 팔로우
3. 콘텐츠 분석 & 토픽/엔티티 추출
4. Obsidian 마크다운 생성/업데이트:
   - runs/{YYYY-MM-DD-HHmm}.md — 수집 로그
   - daily/{YYYY-MM-DD}.md — 데일리 노트 (**기존 파일이 있으면 덮어쓰지 말고 Edit 툴로 하단에 append**)
   - topics/*.md — 토픽 노트 (## 리소스 섹션 필수, 학습 가능한 수준)
   - entities/*.md — 엔티티 노트
   - _index.md — 전체 인덱스 업데이트

## 품질 기준
- 모든 토픽 노트에 ## 리소스 섹션 포함 (GitHub/공식사이트/논문 링크)
- 설치 명령어, CLI 사용법, 구체적 수치 포함
- 원문 인용구 (> 블록) 포함
- WebFetch로 외부 링크 딥다이브 최소 2건 이상

## 에러 처리
- 브라우저 미연결 시: 로그 남기고 중단
- 로그인 만료 시: WebSearch 폴백
- 스크롤 무반응 시: 3회 시도 후 현재 수집분으로 진행
- CAPTCHA 감지 시: 즉시 중단, 절대 우회 안 함
