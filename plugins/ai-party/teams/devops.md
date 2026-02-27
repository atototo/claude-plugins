---
name: devops
description: "K8s 리소스 최적화, 배포, 인프라 설정 변경 파이프라인"
trigger_keywords:
  - kubernetes
  - k8s
  - resource
  - cpu
  - memory
  - deploy
  - helm
  - terraform
  - 리소스
  - 배포
  - 스케일
  - 클러스터
  - infrastructure
  - infra
---

# DevOps Team

K8s 리소스 최적화, 배포, 인프라 설정 변경 파이프라인.
메트릭 기반 분석으로 비용 절감 및 안정성 향상.

## Members

### gemini-agent as analyst
- **Phase**: analyzing
- **Instructions**: 메트릭, 단가표, 리소스 사용량을 분석하라. 과다/과소 할당 식별, 비용 절감 가능액을 산출하라. 수정 전후 비교 데이터를 포함. 결과를 `.party/findings/analysis.md`에 저장하라.

### claude-agent as architect
- **Phase**: planning
- **Instructions**: 분석 결과를 바탕으로 최적화 전략을 수립하라. 변경 전/후 비교, 실행 명령, 롤백 명령을 포함하라. 결과를 `.party/findings/design.md`에 저장하라.

### codex-agent as builder
- **Phase**: executing
- **Instructions**: helm values, k8s manifest, terraform 파일을 수정하라. 변경 사항에 대한 kubectl/helm 명령을 생성하라. 결과를 `.party/findings/implementation.md`에 저장하라.

## Workflow

1. **ANALYZING**: gemini-agent(analyst) — 메트릭/리소스 분석
2. **PLANNING**: claude-agent(architect) — depends on ANALYZING
3. **EXECUTING**: codex-agent(builder) — depends on PLANNING
4. **APPROVAL**: Host가 결과 종합 → 실행/롤백 명령 포함하여 승인 요청

## Finding Card Sections

- **analysis**: 메트릭 요약, 과다/과소 할당 목록, 비용 분석, 수정 전후 비교
- **design**: 최적화 전략, 변경 범위, 실행 명령, 롤백 명령
- **implementation**: 변경 파일(helm/k8s/terraform), config diff, 절감액
