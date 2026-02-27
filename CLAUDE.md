## Claude Plugins Repository Conventions

### 일반 규칙
- 모든 플러그인은 plugins/ 디렉토리 아래 독립 디렉토리로 구성한다
- 각 플러그인은 `claude plugin validate .`을 통과해야 한다
- 공용 코드 수정 시 `bash scripts/build.sh`로 각 플러그인에 반영한다

### 코딩 컨벤션
- 쉘 스크립트: `set -euo pipefail` 필수
- Node.js 스크립트: ESM 사용 (`import`), 에러 핸들링 필수
- JSON 출력: `ok`, `source`, `exit_code` 필드 통일

### 커밋 컨벤션
- `feat(plugin-name): 설명` — 새 기능
- `fix(plugin-name): 설명` — 버그 수정
- `chore(shared): 설명` — 공용 모듈 변경
- `docs: 설명` — 문서 변경
