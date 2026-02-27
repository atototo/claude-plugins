# Claude Code Plugins

Claude Code 플러그인 모노레포. 여러 플러그인을 하나의 레포에서 관리한다.

## Plugins

| 플러그인 | 설명 | 상태 |
|----------|------|------|
| [multi-delegate](./plugins/multi-delegate/) | Codex/Gemini에 작업 위임 + Claude 검수 | v0.1.0 |

## 아키텍처

```
Claude (두뇌: 설계/판단/검수)
    │
    ├─ /codex    → 단일 파일 보일러플레이트 (Codex CLI)
    ├─ /gemini   → 대용량 분석/멀티파일 생성 (Gemini CLI)
    └─ /delegate → 자동 라우팅
         │
         ↓
    PostToolUse 훅 (테스트 자동 실행)
         ↓
    Claude 2차 검수 (diff 분석 → 승인/수정/롤백)
```

## 설치

### 마켓플레이스 (사용자)

**CLI:**

```bash
/plugin marketplace add atototo/claude-plugins
/plugin install multi-delegate@atoto-claude-plugins
```

**UI:**

1. `/plugin` 입력 → **Marketplaces** 탭 → **+ Add Marketplace**
2. `atototo/claude-plugins` 입력
3. **Plugins** 탭에서 `multi-delegate` 설치

### 로컬 개발

```bash
git clone https://github.com/atototo/claude-plugins.git
cd claude-plugins

# 공용 모듈 빌드 (shared → 각 플러그인 복사)
npm run build

# 플러그인 로컬 테스트
claude --plugin-dir plugins/multi-delegate
```

## 구조

```
claude-plugins/
├── .claude-plugin/marketplace.json   # 마켓플레이스 매니페스트
├── CLAUDE.md                         # 공통 개발 컨벤션
├── shared/                           # 공용 모듈 (빌드 시 복사)
│   ├── scripts/common.sh
│   └── hooks/post-verify.mjs
├── plugins/                          # 플러그인 모음
│   └── multi-delegate/               # Codex + Gemini 위임
├── scripts/                          # 레포 관리
│   ├── build.sh                      # shared → plugins 복사
│   ├── validate-all.sh               # 전체 검증
│   └── new-plugin.sh                 # 새 플러그인 스캐폴딩
└── package.json                      # npm workspaces
```

## 새 플러그인 추가

```bash
npm run new-plugin -- my-new-plugin
cd plugins/my-new-plugin
# commands, skills, hooks 구현
claude plugin validate .
```

## 요구사항

| 도구 | 용도 |
|------|------|
| Claude Code CLI | 플러그인 호스트 |
| Codex CLI (`codex`) | Codex 위임 |
| Gemini CLI (`gemini`) | Gemini 위임 |
| Node.js 18+ | 훅 스크립트 |
| Git 2.x+ | diff/롤백 |
| jq | JSON 파싱 |
