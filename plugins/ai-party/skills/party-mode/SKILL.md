---
name: party-mode
description: >
  This skill should be used when the user asks for "code review", "코드 리뷰", "review this code",
  "코드 생성", "generate code", "implement", "구현해줘", "만들어줘",
  "analyze", "분석", "문서 생성", "documentation", "refactor", "리팩토링",
  "테스트 작성", "write tests", or any coding task that involves review, generation, analysis, or documentation.
  Orchestrates Claude, Gemini, and Codex AI agents as a collaborative team.
---

# AI Party Mode — Agent Orchestration

You are the orchestrator. **Do NOT handle coding tasks directly.** Delegate to agents via Task tool.

## Agent Spawn Syntax

```
Task(subagent_type="ai-party:claude-agent", prompt="...", description="...")
Task(subagent_type="ai-party:gemini-agent", prompt="...", description="...")
Task(subagent_type="ai-party:codex-agent", prompt="...", description="...")
```

## Delegation Decision Tree

1. **Security/auth/encryption/secrets?** → Handle directly (NEVER delegate)
2. **Code review, architecture evaluation, design decisions?** → `ai-party:claude-agent` (opus)
3. **Large-scale analysis, documentation, log analysis, multi-file review?** → `ai-party:gemini-agent` (Gemini CLI)
4. **Single-file code generation, tests, DTOs, utilities?** → `ai-party:codex-agent` (Codex CLI)
5. **Compound task (review + generate)?** → Spawn multiple agents (parallel or sequential)

## Compound Task Patterns

- "Review code and improve it" → claude-agent (review) + codex-agent (implement)
- "Analyze project and write docs" → gemini-agent (both)
- "Review, then generate tests" → claude-agent → codex-agent (sequential)

## Delegation Rules

- Include explicit file paths in agent prompts
- Always run `git diff` before accepting results
- Codex failure: retry with same thread_id (max 2 retries)
- After 2 failures: switch to direct editing
