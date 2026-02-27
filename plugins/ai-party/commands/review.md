---
description: Delegate code review to claude-agent (opus) for deep analysis
argument-hint: <file or directory to review>
allowed-tools: Task, Read, Grep, Glob
---

# /review

코드 리뷰를 claude-agent (opus)에게 위임한다.

## 실행 프로토콜

1. `$ARGUMENTS`에서 리뷰 대상 파일/디렉토리를 확인한다.
2. 대상 파일을 Read로 읽어 내용을 파악한다.
3. **반드시** `ai-party:claude-agent`를 Task 도구로 스폰하여 리뷰를 위임한다.
4. 직접 리뷰하지 않는다.

## 스폰 방법

```
Task(
  subagent_type="ai-party:claude-agent",
  prompt="다음 코드를 리뷰해줘. 아키텍처, 코드 품질, 보안, 성능 관점에서 분석하고 개선 제안을 해줘.\n\n파일: [파일경로]\n\n[파일 내용]",
  description="Code review with opus"
)
```

## 결과 처리

claude-agent 결과를 받으면 사용자에게 리뷰 결과를 전달한다.
