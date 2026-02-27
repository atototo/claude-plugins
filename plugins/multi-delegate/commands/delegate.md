---
description: Auto-route a task to the best delegate (Codex, Gemini, or handle directly)
argument-hint: <task description>
allowed-tools: Bash, Read, Grep, Glob
---

# /delegate

Analyze the task and automatically route to the optimal handler.

## Routing Protocol

1. Analyze `$ARGUMENTS` against SKILL.md delegation criteria.
2. Determine target:
   - **Codex**: single-file, concrete spec, testable boilerplate
   - **Gemini**: analysis, documentation, multi-file scaffolding, config generation
   - **Claude direct**: security, complex bugs, refactoring, performance
3. Announce routing decision to user.
4. Execute via appropriate script.
5. Run review protocol (same as /codex or /gemini).
