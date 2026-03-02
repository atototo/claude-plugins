---
name: feature
description: "기능 분석 → 설계 → 구현 → 리뷰 파이프라인"
trigger_keywords:
  - feature
  - 기능
  - implement
  - 구현
  - 추가
  - 개발
  - add feature
  - new feature
---

# Feature Team

신규 기능 개발 파이프라인. 요구사항 분석에서 구현, 리뷰까지의 전체 흐름.
2명의 builder가 병렬로 구현을 수행한다.

## Members

### analyst
- **Phase**: analyzing
- **Instructions**: 기능 요구사항을 분석하라. 기존 코드베이스에서 관련 모듈, 의존성, 영향 범위를 파악하라. 결과를 `.party/findings/analysis.md`에 저장하라.

### architect
- **Phase**: planning
- **Instructions**: 분석 결과를 바탕으로 기능 설계를 수행하라. 컴포넌트 구조, 데이터 흐름, API 인터페이스를 정의하라. 구현 범위를 builder와 builder-2에 분배하라. 결과를 `.party/findings/design.md`에 저장하라.

### builder
- **Phase**: executing
- **Instructions**: Architect가 배분한 범위의 핵심 기능을 구현하라. 단위 테스트를 함께 작성하라. 결과를 `.party/findings/implementation.md`에 저장하라.

### builder-2
- **Phase**: executing
- **Instructions**: Architect가 배분한 범위의 보조 기능/통합 코드를 구현하라. 통합 테스트를 함께 작성하라. 결과를 `.party/findings/implementation-2.md`에 저장하라.

### reviewer
- **Phase**: reviewing
- **Instructions**: 두 builder의 변경 사항을 통합 리뷰하라. 설계 준수, 코드 품질, 테스트 커버리지, 보안을 확인하라. 결과를 `.party/findings/review.md`에 저장하라.

## Workflow

1. **ANALYZING**: analyst — 요구사항 분석 및 영향 범위 파악
2. **PLANNING**: architect — depends on ANALYZING
3. **EXECUTING**: builder + builder-2 병렬 — depends on PLANNING
4. **REVIEWING**: reviewer — depends on EXECUTING
5. **APPROVAL**: Host가 결과 종합 → 사용자에게 승인 요청

## Finding Card Sections

- **analysis**: 요구사항, 관련 모듈, 의존성, 영향 범위
- **design**: 컴포넌트 구조, 데이터 흐름, API, 구현 범위 분배
- **implementation**: 핵심 기능 변경 파일, git diff, 테스트 결과
- **implementation-2**: 보조 기능 변경 파일, git diff, 통합 테스트 결과
- **review**: 통합 리뷰 결과, 설계 준수, 품질, 보안 판정
