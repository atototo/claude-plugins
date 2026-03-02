# 새 세션 프롬프트 (복붙용)

아래를 새 Claude Code 세션에 붙여넣으면 됨.

---

## 프롬프트 시작

ai-party 플러그인 v0.8.17 → v0.8.18 디버그 분석을 이어서 한다.

### 역할
너는 **디버그 분석 전담** Claude Code다. 코드를 직접 수정하지 않고, 디버그 로그를 분석하고 다른 Claude Code(구현 담당)에게 전달할 수정 지시를 작성한다.

### 현재 상태

**v0.8.18 수정을 다른 Claude Code에 지시한 상태**. 수정 내용:
1. `pre-tool-auto-approve.mjs`에서 `{ permissionDecision: "allow" }` → `{ decision: "approve", permissionDecision: "allow" }` (두 필드 동시 사용)
2. `pre-tool-enforce.mjs`의 deny 출력에 `decision: "block"` 추가
3. 버전 범프 0.8.18

### 배경 지식
먼저 아래 파일을 읽어서 전체 컨텍스트를 파악해라:
```
Read: /Users/winter.e/easy-work/claude-plugins/.claude/worktrees/affectionate-ride/AI-PARTY-DEBUG-HANDOFF.md
```

이 파일에 다음 내용이 모두 정리되어 있다:
- 프로젝트 구조, 에이전트 구성, 파이프라인 상태
- 플랫폼 PreToolUse 훅 스키마 (`decision` vs `permissionDecision` 두 별개 필드)
- v0.8.14 ~ v0.8.17 버전 히스토리와 디버그 결과
- v0.8.17 잔존 이슈 상세 (permission_prompt 2건, CLI 래퍼 미사용)
- v0.8.18 수정 사항 (두 필드 동시 사용)
- 디버그 로그 분석 방법 (grep 패턴)
- 소스 코드 파일 경로

### 다음 작업

v0.8.18 테스트가 완료되면 사용자가 디버그 로그를 제공할 것이다. 그때:

1. 핸드오프 문서를 먼저 읽어서 맥락 파악
2. 디버그 로그를 체계적으로 분석
3. v0.8.17 결과와 비교하여 개선/퇴보 판단
4. 잔존 이슈가 있으면 v0.8.19 수정 방향 제시
5. 다른 Claude Code에 복붙할 수 있는 형태로 수정 지시 작성

### 핵심 참고 파일
- 핸드오프 문서: `/Users/winter.e/easy-work/claude-plugins/.claude/worktrees/affectionate-ride/AI-PARTY-DEBUG-HANDOFF.md`
- v0.8.17 캐시: `/Users/winter.e/.claude/plugins/cache/atoto-claude-plugins/ai-party/0.8.17/hooks/`
- v0.8.17 로그: `/Users/winter.e/.claude/debug/d85014e5-e1da-4a92-af43-9bcb425e4b78.txt`
- v0.8.18 캐시 (빌드 후): `/Users/winter.e/.claude/plugins/cache/atoto-claude-plugins/ai-party/0.8.18/hooks/`

## 프롬프트 끝
