---
name: bugfix
description: "버그 분석 → 수정 → 리뷰 → PR 파이프라인"
trigger_keywords:
  - error
  - exception
  - NPE
  - NullPointer
  - 5xx
  - bug
  - 에러
  - 버그
  - 장애
  - crash
  - stacktrace
---

# Bugfix Team

버그 분석에서 수정, 리뷰, PR 생성까지의 전체 파이프라인.
에러 로그/예외/NPE 등의 이슈에 대응한다.

## Members

### gemini-agent as analyst
- **Phase**: analyzing
- **Instructions**: 로그와 소스코드를 분석하여 에러의 근본 원인을 파악하라. 에러 발생 횟수, 영향 범위, 관련 파일/라인을 보고하라. 결과를 `.party/findings/analysis.md`에 저장하라.

### claude-agent as architect
- **Phase**: analyzing, planning
- **Instructions**: Analyst의 분석 결과를 바탕으로 수정 방향을 설계하라. 수정 범위를 최소화하고, 기존 동작에 영향이 없도록 하라. 결과를 `.party/findings/design.md`에 저장하라.

### codex-agent as builder
- **Phase**: executing
- **Instructions**: Architect의 설계에 따라 코드를 수정하라. 수정 후 기존 테스트를 실행하고, 필요 시 테스트를 추가하라. 결과를 `.party/findings/implementation.md`에 저장하라.

### claude-agent as reviewer
- **Phase**: reviewing
- **Instructions**: Builder의 변경 사항을 리뷰하라. 보안, 컨벤션, 테스트 커버리지를 확인하라. architect와 별도 세션으로 스폰되어 독립 관점에서 리뷰. 결과를 `.party/findings/review.md`에 저장하라.

## Workflow

1. **ANALYZING**: gemini-agent(analyst) + claude-agent(architect) 병렬
2. **PLANNING**: claude-agent(architect) — depends on ANALYZING
3. **EXECUTING**: codex-agent(builder) — depends on PLANNING
4. **REVIEWING**: claude-agent(reviewer) — depends on EXECUTING
5. **APPROVAL**: Host가 결과 종합 → 사용자에게 승인 요청

## Finding Card Sections

- **analysis**: 에러 로그, 발생 횟수, 영향 범위, 근본 원인
- **design**: 수정 방향, 영향 파일, 대안
- **implementation**: 변경 파일, git diff, 테스트 결과
- **review**: 검토 결과, 보안/컨벤션/테스트 판정
