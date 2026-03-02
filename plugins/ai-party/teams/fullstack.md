---
name: fullstack
description: "프론트엔드 + 백엔드 + 배포까지의 풀스택 개발 파이프라인"
trigger_keywords:
  - fullstack
  - 풀스택
  - full-stack
  - 전체
  - end-to-end
  - 프론트+백
---

# Fullstack Team

프론트엔드와 백엔드를 동시에 개발하는 풀스택 파이프라인.
설계 → 병렬 구현(프론트/백) → 배포 준비 → 리뷰.

## Members

### architect
- **Phase**: planning
- **Instructions**: 풀스택 설계를 수행하라. API 계약(contract), 프론트엔드 컴포넌트 구조, 백엔드 서비스 구조를 정의하라. builder-frontend와 builder-backend의 구현 범위를 분배하라. 결과를 `.party/findings/design.md`에 저장하라.

### builder-frontend
- **Phase**: executing
- **Instructions**: Architect의 설계에 따라 프론트엔드를 구현하라. 컴포넌트, 상태 관리, API 연동을 포함하라. 결과를 `.party/findings/implementation-frontend.md`에 저장하라.

### builder-backend
- **Phase**: executing
- **Instructions**: Architect의 설계에 따라 백엔드를 구현하라. API 엔드포인트, 서비스, 데이터 모델을 포함하라. 결과를 `.party/findings/implementation-backend.md`에 저장하라.

### deployer
- **Phase**: executing
- **Instructions**: 프론트엔드/백엔드 빌드 설정, 환경변수, 배포 스크립트를 준비하라. CI/CD 파이프라인 변경이 필요하면 포함하라. 결과를 `.party/findings/implementation-deploy.md`에 저장하라.

### reviewer
- **Phase**: reviewing
- **Instructions**: 프론트엔드, 백엔드, 배포 설정을 통합 리뷰하라. API 계약 일치, 보안, 테스트 커버리지, 배포 안전성을 확인하라. 결과를 `.party/findings/review.md`에 저장하라.

## Workflow

1. **PLANNING**: architect — 풀스택 설계 및 API 계약 정의
2. **EXECUTING**: builder-frontend + builder-backend + deployer 병렬 — depends on PLANNING
3. **REVIEWING**: reviewer — depends on EXECUTING
4. **APPROVAL**: Host가 결과 종합 → 사용자에게 승인 요청

## Finding Card Sections

- **design**: API 계약, 프론트엔드/백엔드 구조, 배포 전략
- **implementation-frontend**: 프론트엔드 변경 파일, git diff, 테스트 결과
- **implementation-backend**: 백엔드 변경 파일, git diff, 테스트 결과
- **implementation-deploy**: 배포 설정, CI/CD 변경, 환경변수
- **review**: 통합 리뷰 결과, API 계약 일치, 보안, 배포 안전성
