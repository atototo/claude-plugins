# AI Party 플러그인 구현 시작 프롬프트

> Claude Desktop Code 새 세션에서 사용
> 작업 디렉토리: claude-plugins 레포 루트

---

## 프롬프트 (복사해서 붙여넣기)

```
ai-party-plugin-design.md 설계 문서를 읽고, claude-plugins 모노레포에 ai-party 플러그인 Phase 1을 구현해줘.

## 프로젝트 컨텍스트

이 레포는 Claude Code 플러그인 모노레포(https://github.com/atototo/claude-plugins)야.
기존에 plugins/multi-delegate/ 플러그인이 Phase 1까지 완성되어 있어.
이제 두 번째 플러그인 plugins/ai-party/를 추가하려고 해.

## ai-party 플러그인이 뭐냐면

Claude, Gemini, Codex 에이전트들이 "파티 모드"로 협업하는 플러그인이야.
- Host(Claude Code 세션) = Lead/오케스트레이터 (팀 소집, 승인 게이트)
- claude-agent (opus) = 설계/리뷰/판단 전문, 독립 컨텍스트
- gemini-agent (sonnet + Gemini CLI) = 분석/문서 전문
- codex-agent (sonnet + Codex CLI) = 구현/수정 전문
- 에이전트끼리 Agent Teams로 직접 메시징하며 논의
- 문제 유형에 따라 팀 프리셋(bugfix, devops, dev-backend 등)으로 조합

## Phase 1 구현 범위

Step 1: 플러그인 기본 구조 생성
- .claude-plugin/plugin.json
- settings.json (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 활성화)
- package.json
- CLAUDE.md (파티 모드 정책)

Step 2: AI 에이전트 정의 (agents/ 디렉토리)
- agents/claude-agent.md (model: opus, 추론/설계/리뷰)
- agents/gemini-agent.md (model: sonnet, Gemini CLI 호출)
- agents/codex-agent.md (model: sonnet, Codex CLI 호출)

Step 3: 실행 스크립트 (multi-delegate에서 복사/수정)
- scripts/codex_exec.sh
- scripts/gemini_exec.sh  
- scripts/common.sh

## 중요 규칙

1. 설계 문서(ai-party-plugin-design.md)가 레포 루트에 있으니 먼저 읽어
2. 기존 plugins/multi-delegate/의 구조와 scripts/를 참고해서 일관성 유지
3. agents/ .md 파일은 설계 문서 섹션 10의 상세 스펙을 따라 작성
4. plugin.json에 agents 경로 등록 잊지 마
5. 각 단계 완료 후 claude plugin validate . 으로 검증
6. 커밋 메시지 컨벤션: feat: [ai-party] ...

Phase 1 완료 후 결과 보여줘.
```

---

## 사전 준비

프롬프트 실행 전에 설계 문서를 레포 루트에 복사해둬야 함:

```bash
cp ai-party-plugin-design.md ~/path/to/claude-plugins/
```
