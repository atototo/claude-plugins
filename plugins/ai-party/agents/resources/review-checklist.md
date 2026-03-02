# Code Review Checklist

Use this checklist when reviewing code changes. Write results to `.party/findings/review.md`.

## Scope & Design Adherence
- [ ] Changes match architect's design scope (no scope creep)
- [ ] All acceptance criteria from design.md are addressed
- [ ] No unnecessary changes outside the defined scope
- [ ] Design rationale is preserved in implementation

## Code Quality
- [ ] Naming follows project conventions (variables, functions, files)
- [ ] Import style matches existing patterns
- [ ] No dead code or commented-out code
- [ ] No TODO/FIXME without associated ticket
- [ ] DRY — no unnecessary duplication
- [ ] KISS — simplest solution that works
- [ ] Functions have single responsibility

## Security (OWASP Top 10)
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] Input validation on all user-facing inputs
- [ ] No SQL injection vectors (parameterized queries)
- [ ] No XSS vectors (output encoding/escaping)
- [ ] No command injection (shell escaping)
- [ ] No path traversal (path validation)
- [ ] Authentication checks where required
- [ ] Authorization checks where required
- [ ] Sensitive data not logged

## Error Handling
- [ ] Errors fail fast with meaningful messages
- [ ] No silent error suppression
- [ ] Error context preserved for debugging
- [ ] Graceful degradation where appropriate

## Testing
- [ ] Unit tests for new/changed functionality
- [ ] Edge cases covered (null, empty, boundary values)
- [ ] Existing tests still pass
- [ ] Test names describe behavior, not implementation

## Performance
- [ ] No obvious N+1 queries or O(n^2) algorithms
- [ ] No unnecessary synchronous blocking
- [ ] Resource cleanup (connections, file handles)
- [ ] No memory leaks (event listeners, subscriptions)

## Verdict Options
- **PASS**: All checks pass, ready for deployment
- **MINOR**: Minor issues found, can be fixed without re-review
- **REJECT**: Significant issues found, requires re-implementation and re-review
