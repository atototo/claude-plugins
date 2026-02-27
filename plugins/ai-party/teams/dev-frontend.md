---
name: dev-frontend
description: "프론트엔드 컴포넌트 설계 → 구현 → 분석 파이프라인"
trigger_keywords:
  - component
  - UI
  - 컴포넌트
  - 페이지
  - responsive
  - frontend
  - 프론트엔드
  - React
  - Vue
  - CSS
  - 화면
---

# Frontend Development Team

프론트엔드 개발 파이프라인. 설계 → 구현 → 기존 코드 분석.

## Members

### claude-agent as architect
- **Phase**: planning
- **Instructions**: 컴포넌트 설계, 상태 관리, 레이아웃 구조를 정의하라. 기존 디자인 시스템과 패턴을 따르라. 결과를 `.party/findings/design.md`에 저장하라.

### codex-agent as builder
- **Phase**: executing
- **Instructions**: 설계에 따라 컴포넌트, 스타일, 테스트를 구현하라. 접근성(WCAG) 기본 준수. 결과를 `.party/findings/implementation.md`에 저장하라.

### gemini-agent as analyst
- **Phase**: reviewing
- **Instructions**: 기존 코드베이스와의 일관성, 중복 컴포넌트 여부, 번들 사이즈 영향을 분석하라. 결과를 `.party/findings/review.md`에 저장하라.

## Workflow

1. **PLANNING**: claude-agent(architect) — 컴포넌트 설계 및 구조 정의
2. **EXECUTING**: codex-agent(builder) — depends on PLANNING
3. **REVIEWING**: gemini-agent(analyst) — depends on EXECUTING, 기존 코드 분석
4. **APPROVAL**: Host가 결과 종합 → 사용자에게 승인 요청

## Finding Card Sections

- **design**: 컴포넌트 구조, 상태 관리, 레이아웃, 디자인 시스템 연동
- **implementation**: 변경 파일, git diff, 테스트 결과, 스크린샷 경로
- **review**: 기존 코드 일관성, 중복 여부, 번들 영향, 접근성 판정
