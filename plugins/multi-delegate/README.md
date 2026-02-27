# multi-delegate

Claude Code에서 Codex와 Gemini에 작업을 위임하고, Claude가 검수하는 플러그인.

## 설치 (마켓플레이스)

**CLI:**

```bash
/plugin marketplace add atototo/claude-plugins
/plugin install multi-delegate@atoto-claude-plugins
```

**UI:**

1. `/plugin` 입력 → **Marketplaces** 탭 → **+ Add Marketplace**
2. `atototo/claude-plugins` 입력
3. **Plugins** 탭에서 `multi-delegate` 설치

## 로컬 테스트 (개발자)

```bash
claude --plugin-dir plugins/multi-delegate
```

## 사용법

### 슬래시 커맨드

- `/codex <task>` — 단일 파일 보일러플레이트를 Codex에 위임
- `/gemini <task>` — 대용량 분석/멀티파일 생성을 Gemini에 위임
- `/delegate <task>` — 자동 라우팅 (작업 특성에 따라 최적 대상 선택)

### 요구사항

| 도구 | 용도 | 인증 |
|------|------|------|
| Claude Code CLI | 플러그인 호스트 | Anthropic API Key |
| Codex CLI (`codex`) | Codex 위임 실행 | `OPENAI_API_KEY` |
| Gemini CLI (`gemini`) | Gemini 위임 실행 | Google AI 인증 |
| Node.js 18+ | 훅 스크립트 실행 | - |
| Git 2.x+ | diff 확인, 롤백 | - |
