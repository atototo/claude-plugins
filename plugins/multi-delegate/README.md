# multi-delegate

Claude Code에서 Codex와 Gemini에 작업을 위임하고, Claude가 검수하는 플러그인.

## 설치

**CLI:**

```bash
/plugin marketplace add atototo/claude-plugins
/plugin install multi-delegate@atoto-claude-plugins
```

**UI:**

1. `/plugin` → **Marketplaces** 탭 → **+ Add Marketplace**
2. `atototo/claude-plugins` 입력하여 마켓플레이스 등록
3. **Plugins** 탭 → `multi-delegate` **Install**

설치 후 Claude Code 재시작.

## 사용법

| 커맨드 | 용도 | 예시 |
|--------|------|------|
| `/codex <task>` | 단일 파일 보일러플레이트 위임 | `/codex UserDTO 타입 정의 생성` |
| `/gemini <task>` | 대용량 분석/멀티파일 생성 위임 | `/gemini 이 로그 파일 분석해줘` |
| `/delegate <task>` | 자동 라우팅 (최적 대상 선택) | `/delegate REST API 엔드포인트 생성` |

## 위임 판단 기준

```
보안/인증/암호화 관련?  → Claude 직접 (위임 금지)
단일 파일 + 구체적 스펙? → Codex
대용량 분석 / 멀티파일?  → Gemini
복잡한 버그 / 리팩터링?  → Claude 직접
```

## 검수 흐름

1. **1차 검증** (자동) — PostToolUse 훅이 테스트 자동 실행, 실패 시 차단
2. **2차 검수** (Claude) — git diff 분석 → 승인 / 수정 / 롤백

## 요구사항

| 도구 | 용도 | 인증 |
|------|------|------|
| Claude Code CLI | 플러그인 호스트 | Anthropic API Key |
| Codex CLI (`codex`) | Codex 위임 | `OPENAI_API_KEY` |
| Gemini CLI (`gemini`) | Gemini 위임 | Google AI 인증 |
| Node.js 18+ | 훅 스크립트 | - |
| Git 2.x+ | diff/롤백 | - |

## 로컬 개발

```bash
git clone https://github.com/atototo/claude-plugins.git
cd claude-plugins
npm run build
claude --plugin-dir plugins/multi-delegate
```
