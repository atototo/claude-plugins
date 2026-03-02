---
name: migration
description: "기술 마이그레이션, 업그레이드, 대규모 리팩터링 파이프라인"
trigger_keywords:
  - migration
  - 마이그레이션
  - upgrade
  - 업그레이드
  - refactor
  - 리팩터링
  - modernize
  - 현대화
  - legacy
  - 레거시
---

# Migration Team

기술 마이그레이션 및 대규모 리팩터링 파이프라인.
영향도 분석 → 마이그레이션 설계 → 병렬 구현 → 리뷰.

## Members

### analyst
- **Phase**: analyzing
- **Instructions**: 마이그레이션 대상의 현재 상태를 분석하라. 의존성 맵, 영향 범위, 호환성 이슈, 리스크 요소를 식별하라. 결과를 `.party/findings/analysis.md`에 저장하라.

### architect
- **Phase**: planning
- **Instructions**: 분석 결과를 바탕으로 마이그레이션 계획을 수립하라. 단계별 전환 전략, 롤백 계획, 호환성 유지 방안을 포함하라. 구현 범위를 builder와 builder-2에 분배하라. 결과를 `.party/findings/design.md`에 저장하라.

### builder
- **Phase**: executing
- **Instructions**: Architect의 계획에 따라 핵심 마이그레이션을 수행하라. 기존 테스트가 통과하는지 확인하라. 결과를 `.party/findings/implementation.md`에 저장하라.

### builder-2
- **Phase**: executing
- **Instructions**: Architect의 계획에 따라 보조 마이그레이션(설정, 의존성, 호환성 레이어)을 수행하라. 통합 테스트를 작성하라. 결과를 `.party/findings/implementation-2.md`에 저장하라.

### reviewer
- **Phase**: reviewing
- **Instructions**: 마이그레이션 전체를 리뷰하라. 하위 호환성, 기존 테스트 통과 여부, 롤백 가능성, 누락된 변경을 확인하라. 결과를 `.party/findings/review.md`에 저장하라.

## Workflow

1. **ANALYZING**: analyst — 현재 상태 분석 및 영향도 파악
2. **PLANNING**: architect — depends on ANALYZING
3. **EXECUTING**: builder + builder-2 병렬 — depends on PLANNING
4. **REVIEWING**: reviewer — depends on EXECUTING
5. **APPROVAL**: Host가 결과 종합 → 사용자에게 승인 요청

## Finding Card Sections

- **analysis**: 현재 상태, 의존성 맵, 영향 범위, 리스크
- **design**: 마이그레이션 계획, 단계별 전략, 롤백 계획, 구현 범위 분배
- **implementation**: 핵심 마이그레이션 변경 파일, git diff, 테스트 결과
- **implementation-2**: 보조 마이그레이션 변경 파일, git diff, 통합 테스트 결과
- **review**: 하위 호환성, 테스트 통과, 롤백 가능성, 누락 확인
