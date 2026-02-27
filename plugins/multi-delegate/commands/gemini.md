---
description: Delegate an analysis or multi-file generation task to Gemini with Claude review
argument-hint: <task description>
allowed-tools: Bash, Read, Grep, Glob
---

# /gemini

Delegate analysis, documentation, or multi-file generation to Gemini CLI.

## Execution Protocol

1. Validate `$ARGUMENTS` is non-empty.
2. Identify relevant files for context (if task references specific files).
3. Run:
   ```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini_exec.sh" \
--task "$ARGUMENTS" --workdir "$(pwd)" [--files <file1> <file2> ...]
   ```
4. Parse the JSON output (`ok`, `source`, `response`).
5. If `ok=false` → show error and stop.
6. **[Review Step]**
   a. Run `git diff` if files were modified.
   b. If analysis-only task → review response quality and accuracy.
   c. Check:
      - Generated code compiles/parses correctly
      - File structure follows project conventions
      - No security-sensitive code introduced
   d. Verdict:
      - PASS → report summary to user
      - MINOR → fix directly, then report
      - REJECT → rollback, explain reason

## Notes

- Gemini has no thread resume. For follow-up, re-run with updated task description.
- For file context, pass `--files` — files are piped via stdin (`cat file1 file2 | gemini ...`).
- For directory context, pass `--include-directories` directly.
- Max 2 retries, then switch to direct Claude editing.
