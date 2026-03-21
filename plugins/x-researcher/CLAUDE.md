## X-Researcher — AI 트렌드 자동 리서치

X(트위터)에서 최신 AI 트렌드를 브라우저 자동화로 수집하고 Obsidian vault에 토픽+엔티티 기반 마크다운 문서로 정리하는 플러그인.

### 핵심 기능

- **5-Phase 탐색**: 메인 피드(Following+For you) → 키워드 검색 → 인플루언서 타임라인 → 딥다이브 → 자동 팔로우
- **Obsidian 통합**: topics/, entities/, daily/, runs/ 구조로 자동 문서화
- **스케줄 실행**: 2시간마다 자동 실행 (수동 실행도 가능)
- **피드 확장**: 기준 충족 AI 인플루언서 자동 팔로우로 리서치 범위 복리 확장

### 사용법

- `/x-researcher` — 수동 실행
- 스케줄 태스크로 자동 실행 (2시간마다)

### 필수 요건

- Chrome + Claude in Chrome 확장 설치
- X(트위터) 로그인 상태 유지
- `~/.claude/x-researcher-config.json` 설정 파일
