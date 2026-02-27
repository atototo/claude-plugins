---
description: AI Party mode — route task to the best agent (claude-agent, gemini-agent, codex-agent)
argument-hint: <task description>
allowed-tools: Task, Read, Grep, Glob, Bash, TodoWrite
---

# /party

AI 에이전트 팀에게 작업을 위임한다. 직접 처리하지 않고 반드시 에이전트를 스폰한다.

## 라우팅 프로토콜

1. `$ARGUMENTS`를 분석하여 작업 유형을 판단한다.
2. 아래 판단 기준에 따라 적절한 에이전트를 Task 도구로 스폰한다.
3. **절대로 직접 코드를 작성하거나 분석하지 않는다. 반드시 에이전트에게 위임한다.**

## 판단 기준 (이 순서대로)

1. **코드 리뷰, 아키텍처 설계, 설계 판단, 보안 검토?**
   → `ai-party:claude-agent` 스폰 (opus 모델, 깊은 추론)

2. **대규모 분석, 문서 생성, 로그 분석, 멀티파일 스캐폴딩?**
   → `ai-party:gemini-agent` 스폰 (Gemini CLI 활용)

3. **단일 파일 코드 생성/수정, 보일러플레이트, 유틸리티, 테스트?**
   → `ai-party:codex-agent` 스폰 (Codex CLI 활용)

4. **복합 작업 (리뷰 + 구현, 분석 + 문서 등)?**
   → 여러 에이전트를 순차적으로 스폰. 먼저 분석/리뷰 에이전트, 그 결과로 구현 에이전트.

## 실행 방법

반드시 Task 도구를 사용하여 에이전트를 스폰한다:

```
Task(
  subagent_type="ai-party:claude-agent",  // 또는 gemini-agent, codex-agent
  prompt="[구체적 작업 지시 + 파일 경로 + 컨텍스트]",
  description="[3-5단어 요약]"
)
```

## 복합 작업 예시

**"이 코드 리뷰하고 개선된 버전 만들어줘"**
→ Step 1: `ai-party:claude-agent`에게 코드 리뷰 위임
→ Step 2: 리뷰 결과를 바탕으로 `ai-party:codex-agent`에게 개선 코드 생성 위임

**"이 프로젝트 분석하고 문서 만들어줘"**
→ `ai-party:gemini-agent`에게 분석+문서 생성 일괄 위임

**"이 API 설계 리뷰하고 테스트 코드 만들어줘"**
→ Step 1: `ai-party:claude-agent`에게 설계 리뷰
→ Step 2: `ai-party:codex-agent`에게 테스트 코드 생성

## 결과 보고

에이전트 결과를 받은 후:
1. 결과 요약을 사용자에게 보고
2. 파일 변경이 있으면 `git diff`로 확인
3. 필요 시 추가 에이전트 스폰 제안
