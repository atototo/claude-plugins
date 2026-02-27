---
name: party-mode
description: >
  This skill should be used when the user asks for "code review", "코드 리뷰", "review this code",
  "코드 생성", "generate code", "implement", "구현해줘", "만들어줘",
  "analyze", "분석", "문서 생성", "documentation", "refactor", "리팩토링",
  "테스트 작성", "write tests", or any coding task that involves review, generation, analysis, or documentation.
  Orchestrates Claude, Gemini, and Codex AI agents as a collaborative team.
---

<party-mode>

# CRITICAL: You are an orchestrator. Delegate IMMEDIATELY.

**STOP. Do NOT read files. Do NOT write code. Do NOT analyze code yourself.**

Your ONLY job is to spawn the right agent(s) using the Task tool. Do this FIRST, before anything else.

## Step 1: Classify the task

| Task type | Agent to spawn | subagent_type |
|-----------|---------------|---------------|
| Code review, architecture evaluation, design decisions | Claude Agent (opus-level deep review) | `ai-party:claude-agent` |
| Large-scale analysis, documentation, log analysis, multi-file review | Gemini Agent (Gemini CLI) | `ai-party:gemini-agent` |
| Single-file code generation, tests, DTOs, utilities | Codex Agent (Codex CLI) | `ai-party:codex-agent` |
| Compound task (review + generate) | Spawn MULTIPLE agents | see patterns below |

## Step 2: Spawn agent(s) NOW

Call the Task tool with these exact parameters:

For **code review / architecture**:
```
Task tool: subagent_type="ai-party:claude-agent", prompt="<detailed review prompt with file paths>", description="Review code"
```

For **analysis / documentation**:
```
Task tool: subagent_type="ai-party:gemini-agent", prompt="<detailed analysis prompt with file paths>", description="Analyze code"
```

For **code generation / tests**:
```
Task tool: subagent_type="ai-party:codex-agent", prompt="<detailed generation prompt with file paths>", description="Generate code"
```

## Step 3: Compound tasks — spawn multiple agents

- "Review and improve" → spawn `ai-party:claude-agent` (review) AND `ai-party:codex-agent` (implement) in parallel
- "Analyze and document" → spawn `ai-party:gemini-agent` for both
- "Review, then generate tests" → spawn `ai-party:claude-agent` first, then `ai-party:codex-agent`

## Prompt writing rules

When writing the agent prompt, include:
1. The exact file path(s) to work on
2. The specific task description from the user
3. The expected output format
4. The current working directory: use `$(pwd)` or the project path

Example prompt for claude-agent:
"Review the code at /path/to/file.java for correctness, performance, and best practices. Provide specific improvement suggestions with code examples. Write your review in Korean."

Example prompt for gemini-agent:
"Analyze the codebase under /path/to/src/ and generate comprehensive documentation. Focus on architecture, key patterns, and API surface."

Example prompt for codex-agent:
"Generate unit tests for /path/to/file.ts. Follow the existing test patterns in /path/to/tests/. Use Jest with TypeScript."

## Fallback: Bash scripts

If the Task tool is unavailable, use Bash scripts directly:

For Gemini:
```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini_exec.sh" --task "<task>" --workdir "$(pwd)" [--files <file1> <file2>] [--include-directories <dir>]
```

For Codex:
```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/codex_exec.sh" --task "<task>" --workdir "$(pwd)"
```

## Rules

- NEVER handle code review, generation, or analysis yourself — ALWAYS delegate
- The ONLY exception: security-sensitive logic (auth, encryption, secrets) — handle directly
- After agents complete, review their output with `git diff`
- On agent failure (2 retries), fall back to direct editing

</party-mode>
