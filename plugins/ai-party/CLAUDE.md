## AI Party Mode — 자동 팀 오케스트레이션

**핵심 원칙: 모든 코딩 작업은 auto-delegate 훅에 의해 자동으로 팀 모드로 처리된다. 직접 처리하지 마라.**

### 자동 위임 흐름

```
사용자 요청 수신
  ↓
auto-delegate 훅 발동 → systemMessage 주입
  ↓
systemMessage 지시에 따라 팀 구성:
  1. teams/*.md에서 trigger_keywords로 팀 선택
  2. TeamCreate → session-cli.mjs init → Leader 스폰 → Worker 전원 스폰
  3. Leader가 파이프라인 관리 (session.json은 Host가 이미 생성)
  4. Host는 승인 게이트만 담당
```

### 중요 규칙

- **Skill(ai-party:party-mode)을 직접 호출하지 마라.** auto-delegate 훅이 systemMessage로 직접 지시한다.
- party-mode 스킬은 `/party` 또는 `/party-team` 슬래시 커맨드 전용이다.
- 사용자 메시지를 받으면 systemMessage의 지시를 따라 팀을 구성하라.
- 복잡도 판단, 싱글 에이전트 모드 선택을 하지 마라 — 항상 팀 모드이다.

### auto-delegate가 건너뛰는 경우 (훅이 exit 0)

- 인사/잡담 (안녕, hi, thanks 등)
- 단순 확인 (네, ok, 알겠어 등)
- git 관련 (커밋, 머지, 푸시 등)
- 슬래시 커맨드 (/ 로 시작)
- 대화 이어가기 (계속, go on 등)

이 경우에만 Host가 직접 처리할 수 있다.

### 팀 명시 커맨드

- `/party <task>` — 자동 팀 선택
- `/party-team <team> <task>` — 팀 지정 (bugfix, devops, dev-backend, dev-frontend)
- `/party-status` — 진행 상황 확인

### 에이전트 참고

| Agent | subagent_type | 용도 |
|-------|---------------|------|
| Claude (opus) | `ai-party:claude-agent` | 코드 리뷰, 아키텍처, 설계 |
| Gemini (CLI) | `ai-party:gemini-agent` | 대규모 분석, 문서, 로그 |
| Codex (CLI) | `ai-party:codex-agent` | 단일 파일 코드 생성, 테스트 |
| Leader (opus) | `ai-party:leader-agent` | 파이프라인 오케스트레이션 |

### 위임 제약 조건

- 위임 프롬프트에 명시적 대상 파일 경로를 포함한다.
- 에이전트 결과의 최종 승인/거부는 항상 Host가 판단한다.
- 보안 민감 로직 (auth, encryption, secrets)은 Host 직접 처리.
