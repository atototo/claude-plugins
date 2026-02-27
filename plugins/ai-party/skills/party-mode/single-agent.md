# Single Agent Spawn Protocol

## Classification

| Task type | Agent | subagent_type |
|-----------|-------|---------------|
| Code review, architecture, design decisions | Claude Agent (opus) | `ai-party:claude-agent` |
| Large-scale analysis, docs, log analysis, multi-file review | Gemini Agent (Gemini CLI) | `ai-party:gemini-agent` |
| Single-file code generation, tests, DTOs, utilities | Codex Agent (Codex CLI) | `ai-party:codex-agent` |

## Spawn Examples

**Code review / architecture:**
```
Task(subagent_type="ai-party:claude-agent", prompt="<review prompt>", description="Review code")
```

**Analysis / documentation:**
```
Task(subagent_type="ai-party:gemini-agent", prompt="<analysis prompt>", description="Analyze code")
```

**Code generation / tests:**
```
Task(subagent_type="ai-party:codex-agent", prompt="<generation prompt>", description="Generate code")
```

## Compound Task Patterns

| Request | Agents | Execution |
|---------|--------|-----------|
| "Review and improve" | claude-agent + codex-agent | parallel |
| "Analyze and document" | gemini-agent alone | single (handles both) |
| "Review, then generate tests" | claude-agent → codex-agent | sequential |
| "Refactor and test" | codex-agent × 2 (refactor → test) | sequential |
| "Analyze and review" | gemini-agent + claude-agent | parallel |

## Prompt Writing Rules

Include in every agent prompt:
1. Exact file path(s) to work on
2. Specific task description from user
3. Expected output format
4. Current working directory

See [prompt-templates.md](prompt-templates.md) for full template.

## Fallback: Bash Scripts

If Task tool is unavailable:

```bash
# Gemini
bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini_exec.sh" --task "<task>" --workdir "$(pwd)"

# Codex
bash "${CLAUDE_PLUGIN_ROOT}/scripts/codex_exec.sh" --task "<task>" --workdir "$(pwd)"
```
