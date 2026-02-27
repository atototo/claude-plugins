---
name: dev-backend
description: "백엔드 API 설계 → 구현 → 리뷰 파이프라인"
trigger_keywords:
  - api
  - endpoint
  - service
  - controller
  - backend
  - 백엔드
  - 서버
  - REST
  - GraphQL
---

# Backend Development Team

백엔드 API 개발 파이프라인. 설계 → 구현 → 테스트 → 리뷰.

## Members

### claude-agent as architect
- **Phase**: planning
- **Instructions**: API 설계, 데이터 모델, 에러 처리 방식을 정의하라. 기존 프로젝트 패턴을 따르라. 결과를 `.party/findings/design.md`에 저장하라.

### codex-agent as builder
- **Phase**: executing
- **Instructions**: 설계에 따라 Controller, Service, Repository, DTO를 구현하라. 단위 테스트를 함께 작성하라. 결과를 `.party/findings/implementation.md`에 저장하라.

### claude-agent as reviewer
- **Phase**: reviewing
- **Instructions**: 구현된 코드의 설계 준수 여부, 예외 처리, 테스트 커버리지를 검토하라. architect와 별도 세션으로 독립 관점에서 리뷰. 결과를 `.party/findings/review.md`에 저장하라.

## Workflow

1. **PLANNING**: claude-agent(architect) — API 설계 및 데이터 모델 정의
2. **EXECUTING**: codex-agent(builder) — depends on PLANNING
3. **REVIEWING**: claude-agent(reviewer) — depends on EXECUTING
4. **APPROVAL**: Host가 결과 종합 → 사용자에게 승인 요청

## Finding Card Sections

- **design**: API 스펙, 데이터 모델, 에러 처리 전략, 엔드포인트 목록
- **implementation**: 변경 파일, git diff, 테스트 결과, 커버리지
- **review**: 설계 준수 여부, 예외 처리, 보안, 테스트 판정
