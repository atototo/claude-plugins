---
name: research
description: "기술 조사 및 분석 보고서 파이프라인"
trigger_keywords:
  - research
  - 조사
  - investigate
  - 탐색
  - 비교
  - comparison
  - evaluate
  - 평가
  - feasibility
  - 가능성
---

# Research Team

기술 조사 및 분석 파이프라인. 구현 없이 조사 보고서를 산출한다.
2명의 researcher가 병렬로 조사한 후 architect가 종합 평가를 수행한다.

## Members

### researcher
- **Phase**: analyzing
- **Instructions**: 주어진 주제의 기술적 측면을 조사하라. 공식 문서, 벤치마크, 사례 연구를 수집하라. 장단점, 제약 사항을 분석하라. 결과를 `.party/findings/research-primary.md`에 저장하라.

### researcher-2
- **Phase**: analyzing
- **Instructions**: 주어진 주제의 대안과 비교 분석을 수행하라. 경쟁 기술, 커뮤니티 동향, 호환성, 마이그레이션 비용을 조사하라. 결과를 `.party/findings/research-secondary.md`에 저장하라.

### architect
- **Phase**: planning
- **Instructions**: 두 researcher의 조사 결과를 종합하여 기술 평가 보고서를 작성하라. 추천 방향, 리스크 분석, 도입 로드맵을 포함하라. 결과를 `.party/findings/design.md`에 저장하라.

## Workflow

1. **ANALYZING**: researcher + researcher-2 병렬 — 기술 조사
2. **PLANNING**: architect — depends on ANALYZING, 종합 평가 및 보고서
3. **APPROVAL**: Host가 결과 종합 → 사용자에게 보고서 제출

## Finding Card Sections

- **research-primary**: 기술 분석, 공식 문서, 벤치마크, 장단점
- **research-secondary**: 대안 비교, 커뮤니티 동향, 호환성, 비용
- **design**: 종합 평가, 추천 방향, 리스크, 도입 로드맵
