---
name: security
description: "보안 감사 및 취약점 분석 파이프라인"
trigger_keywords:
  - security
  - 보안
  - vulnerability
  - 취약점
  - audit
  - 감사
  - CVE
  - OWASP
  - penetration
  - 침투
---

# Security Team

보안 감사 파이프라인. 취약점 스캔, 위협 모델링, 수정 설계까지 수행한다.
구현은 포함하지 않으며, 감사 보고서와 수정 계획을 산출한다.

## Members

### security-auditor
- **Phase**: analyzing
- **Instructions**: 코드베이스 전체를 대상으로 보안 취약점을 스캔하라. OWASP Top 10, 인증/인가 결함, 시크릿 노출, 의존성 취약점(CVE)을 식별하라. 결과를 `.party/findings/audit-primary.md`에 저장하라.

### security-auditor-2
- **Phase**: analyzing
- **Instructions**: 인프라 및 설정 관점에서 보안을 감사하라. 환경변수, CORS, CSP, HTTPS, 로깅 정책, 접근 제어를 점검하라. 결과를 `.party/findings/audit-infra.md`에 저장하라.

### analyst
- **Phase**: analyzing
- **Instructions**: 두 감사관의 결과를 종합하여 위협 모델을 작성하라. 공격 벡터, 위험도(Critical/High/Medium/Low), 영향 범위를 정리하라. 결과를 `.party/findings/analysis.md`에 저장하라.

### architect
- **Phase**: planning
- **Instructions**: 위협 모델을 바탕으로 수정 계획을 수립하라. 우선순위별 수정 사항, 아키텍처 변경, 보안 강화 전략을 포함하라. 결과를 `.party/findings/design.md`에 저장하라.

## Workflow

1. **ANALYZING**: security-auditor + security-auditor-2 + analyst 병렬
2. **PLANNING**: architect — depends on ANALYZING
3. **REVIEWING**: Leader가 감사 결과와 수정 계획 종합
4. **APPROVAL**: Host가 결과 종합 → 사용자에게 승인 요청

## Finding Card Sections

- **audit-primary**: 코드 취약점, OWASP 항목, CVE, 위험도
- **audit-infra**: 인프라 보안, 설정 결함, 접근 제어
- **analysis**: 위협 모델, 공격 벡터, 종합 위험도
- **design**: 수정 계획, 우선순위, 아키텍처 변경, 보안 강화 전략
