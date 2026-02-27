---
name: multi-delegate
description: >
  Route tasks to Codex, Gemini, or handle directly based on task characteristics.
  Codex for single-file boilerplate, Gemini for analysis and multi-file generation,
  Claude for security and complex logic. All delegated results go through review.
version: 0.1.0
---

# Multi-Delegate Skill

## Purpose

Route coding tasks to the optimal handler while Claude focuses on
design, review, and integration.

## Delegation Decision Tree

1. Security/auth/crypto/secrets involved? → Claude direct (NEVER delegate)
2. Single file + concrete spec + testable? → Codex
3. Large analysis / doc-based generation / multi-file scaffolding? → Gemini
4. Multi-file refactoring / deep bug analysis / performance optimization? → Claude direct
5. Unclear? → Claude direct

## Codex Delegation Rules

1. Include explicit target file paths in the prompt.
2. Use CLI wrapper:
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/codex_exec.sh" \
     --task "<task>" --workdir "$(pwd)"
3. On failure, retry with same thread_id first.
4. Max 2 retries, then switch to direct editing.

## Gemini Delegation Rules

1. For file context, pass --files (piped via stdin to Gemini).
2. For directory context, pass --include-directories.
3. Use CLI wrapper:
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini_exec.sh" \
     --task "<task>" --workdir "$(pwd)" [--files <file1> <file2>]
4. No thread resume — re-run with updated task for follow-up.
5. Max 2 retries, then switch to direct editing.

## Review Criteria (applies to ALL delegated results)

### Auto-fix (Claude fixes directly)
- Import path errors
- Naming convention mismatches
- Missing type annotations
- Leftover console.log / print statements
- Minor formatting issues

### Rollback + Re-delegate
- Changes exceed requested scope
- Hardcoded secrets or URLs
- External dependencies not in project
- Wrong file structure

### Rollback + Claude Direct
- Security logic included in output
- Structural conflicts with existing code
- Fundamentally wrong approach

## Delegation Constraints

- Always prefer codex_exec.sh or gemini_exec.sh over direct CLI calls.
- Always review git diff after delegation.
- Never delegate tasks touching auth, encryption, permissions, or secrets.
- Stop automated retry after 2 attempts and switch to direct edits.
