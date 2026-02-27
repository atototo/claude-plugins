---
description: Delegate a simple isolated coding task to Codex with Claude review
argument-hint: <task description>
allowed-tools: Bash, Read, Grep, Glob
---

# /codex

Delegate a low-risk coding task to Codex, then review the output.

## Execution Protocol

1. Validate `$ARGUMENTS` is non-empty.
2. Run:
   ```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/codex_exec.sh" \
--task "$ARGUMENTS" --workdir "$(pwd)"
   ```
3. Parse the JSON output (`ok`, `thread_id`, `response`, `usage`).
4. If `ok=false` → show error and stop.
5. **[Review Step]**
   a. Run `git diff` to review all changes.
   b. Check against review criteria:
      - Changes stay within requested scope
      - No security-sensitive code introduced
      - Naming follows project conventions
      - No hardcoded secrets/URLs
      - No unnecessary external dependencies
   c. Verdict:
      - PASS → report summary to user
      - MINOR → fix directly, then report
      - REJECT → `git checkout .` to rollback, explain reason

## Retry Protocol

If follow-up fix is needed:
1. `bash "${CLAUDE_PLUGIN_ROOT}/scripts/codex_exec.sh" --thread-id "<id>" --task "<fix>" --workdir "$(pwd)"`
2. Fallback: `--resume-last` instead of `--thread-id`
3. Max 2 retries, then switch to direct Claude editing.
