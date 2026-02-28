---
name: party-mode
description: >
  /party 또는 /party-team 슬래시 커맨드 전용 스킬.
  일반 코딩 작업에서는 호출하지 마라 — auto-delegate 훅이 자동으로 팀 모드를 구성한다.
---

<party-mode>

# Party Mode — /party 커맨드 전용 라우터

**이 스킬은 /party 또는 /party-team 커맨드로만 호출된다.**
**일반 코딩 작업에서 이 스킬을 호출하지 마라. auto-delegate 훅이 자동으로 팀 모드를 구성한다.**

## Team Orchestration Protocol

모든 작업을 팀 모드로 처리한다. 복잡도 판단 없이 즉시 팀을 구성한다.

### Step 1: 팀 선택

teams/ 디렉토리의 `.md` 파일을 읽어 YAML frontmatter의 `trigger_keywords`와 사용자 요청을 매칭한다.

```
Glob("teams/*.md") → Read each → parse trigger_keywords → score against task
```

매칭 없으면 동적 팀 구성을 제안한다.

### Step 2: 사용자에게 팀 선택 결과 안내

선택된 팀, 멤버 구성, 워크플로우를 간략히 안내한다.
Leader가 파이프라인을 관리하고, Host는 최종 승인만 담당함을 설명한다.

### Step 3: TeamCreate + 전원 스폰

Follow [team-orchestration.md](team-orchestration.md) protocol:
1. TeamCreate(team_name="party-{team}-{timestamp}")
2. Leader 스폰: Task(subagent_type="ai-party:leader-agent", team_name=..., name="leader")
3. Worker 전원 스폰: Task(subagent_type="ai-party:{agent}", team_name=..., name="{agent}-{role}")
4. Prompt templates: [prompt-templates.md](prompt-templates.md)

### Step 4: 승인 게이트

Leader가 보고하면 [approval-gate.md](approval-gate.md)에 따라 승인/거부/수정 결정.

## Agent Reference

| Task type | Agent | subagent_type |
|-----------|-------|---------------|
| Code review, architecture, design, security | Claude (opus) | `ai-party:claude-agent` |
| Large-scale analysis, docs, logs, multi-file | Gemini (CLI) | `ai-party:gemini-agent` |
| Single-file code gen, tests, DTOs, utils | Codex (CLI) | `ai-party:codex-agent` |

## Rules

- NEVER handle code review, generation, or analysis yourself — ALWAYS delegate
- Exception: security-sensitive logic (auth, encryption, secrets) — handle directly
- Team path: always go through approval gate
- On agent failure after 2 retries, fall back to direct editing

</party-mode>
