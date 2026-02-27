---
name: party-mode
description: >
  AI agent delegation for coding tasks. Classifies complexity and spawns
  Claude/Gemini/Codex agents or assembles teams. Invoke for code review,
  analysis, implementation, documentation, refactoring, testing tasks.
---

<party-mode>

# Party Mode — Agent Delegation Router

**You are an orchestrator. Classify and delegate. Do NOT read files or write code yourself.**

## Step 0: Complexity Assessment

| Condition | Path |
|-----------|------|
| Multi-step (분석+설계+구현+리뷰 필요)? | **Team** → read [team-orchestration.md](team-orchestration.md) |
| User invoked `/party` or `/party-team`? | **Team** → read [team-orchestration.md](team-orchestration.md) |
| Single concern (리뷰만, 생성만, 분석만)? | **Single Agent** → read [single-agent.md](single-agent.md) |
| Simple fix (오타, 설정 변경, 1-2줄)? | **Host Direct** — handle yourself |

## Step 1: Agent Selection Quick Reference

| Task type | Agent | subagent_type |
|-----------|-------|---------------|
| Code review, architecture, design, security | Claude (opus) | `ai-party:claude-agent` |
| Large-scale analysis, docs, logs, multi-file | Gemini (CLI) | `ai-party:gemini-agent` |
| Single-file code gen, tests, DTOs, utils | Codex (CLI) | `ai-party:codex-agent` |
| Compound (review+generate, analyze+document) | Multiple agents | see [single-agent.md](single-agent.md) |

## Step 2: Execute

- **Team Path**: Follow [team-orchestration.md](team-orchestration.md) protocol
- **Single Agent Path**: Follow [single-agent.md](single-agent.md) spawn patterns
- **Prompt writing**: Use templates from [prompt-templates.md](prompt-templates.md)
- **Approval gate**: Follow [approval-gate.md](approval-gate.md) when team workflow completes

## Rules

- NEVER handle code review, generation, or analysis yourself — ALWAYS delegate
- Exception: security-sensitive logic (auth, encryption, secrets) — handle directly
- Single agent: post-agent-verify hook handles review checklist
- Team path: always go through approval gate
- On agent failure after 2 retries, fall back to direct editing

</party-mode>
