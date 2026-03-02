---
name: review
description: "보안/성능/아키텍처 관점의 병렬 코드 리뷰 파이프라인"
trigger_keywords:
  - review
  - 리뷰
  - PR
  - pull request
  - code review
  - 코드리뷰
  - 코드 리뷰
---

# Review Team

보안, 성능, 아키텍처 3가지 관점에서 병렬로 코드 리뷰를 수행한다.
각 리뷰어가 독립적으로 분석한 후 결과를 종합한다.

## Members

### reviewer-security
- **Phase**: reviewing
- **Instructions**: 보안 관점에서 코드를 리뷰하라. OWASP Top 10, 인증/인가, 입력 검증, 시크릿 노출, SQL injection, XSS 등을 점검하라. 결과를 `.party/findings/review-security.md`에 저장하라.

### reviewer-performance
- **Phase**: reviewing
- **Instructions**: 성능 관점에서 코드를 리뷰하라. N+1 쿼리, 불필요한 연산, 메모리 누수, 캐싱 기회, 비동기 처리를 점검하라. 결과를 `.party/findings/review-performance.md`에 저장하라.

### reviewer-architecture
- **Phase**: reviewing
- **Instructions**: 아키텍처 관점에서 코드를 리뷰하라. SOLID 원칙, 의존성 방향, 레이어 분리, 패턴 일관성, 확장성을 점검하라. 결과를 `.party/findings/review-architecture.md`에 저장하라.

## Workflow

1. **ANALYZING**: Leader가 리뷰 대상 코드의 컨텍스트를 수집
2. **REVIEWING**: reviewer-security + reviewer-performance + reviewer-architecture 병렬
3. **APPROVAL**: Host가 3개 리뷰 결과 종합 → 사용자에게 승인 요청

## Finding Card Sections

- **review-security**: 보안 취약점, OWASP 항목, 위험도, 수정 권고
- **review-performance**: 성능 이슈, 병목점, 최적화 기회, 벤치마크
- **review-architecture**: 설계 원칙 준수, 패턴 일관성, 확장성, 기술 부채
