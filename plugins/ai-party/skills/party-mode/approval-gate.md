# Approval Gate Protocol

## When to Trigger

After all workflow phases (ANALYZING → PLANNING → EXECUTING → REVIEWING) are complete.

## Collect Results

1. Read all `.party/findings/*.md` files
2. Run `git diff --stat` for code changes
3. Compile summary

## Present to User

```
════════════════════════════════════════
PARTY RESULT — {team} team
════════════════════════════════════════

Task: {original task}

Analysis ({analyst agent}):
  {summary from findings/analysis.md}

Design ({architect agent}):
  {summary from findings/design.md}

Implementation ({builder agent}):
  {summary from findings/implementation.md}
  Files changed: {git diff --stat}

Review ({reviewer agent}):
  {summary from findings/review.md}

════════════════════════════════════════
  approve / reject / revise
════════════════════════════════════════
```

## Save Approval Request

Write to `.party/approvals/{timestamp}.json`:
```json
{
  "session_id": "{session id}",
  "summary": "{compiled summary}",
  "git_diff_stat": "{git diff --stat output}",
  "requested_at": "{ISO 8601}",
  "status": "pending"
}
```

## Handle Response

| Response | Action |
|----------|--------|
| **approve** | Update session.json → APPROVED |
| **reject** | Update session.json → REJECTED |
| **revise** "{instructions}" | Re-delegate to appropriate agent with revision instructions |

## Cleanup

After approval/rejection:
1. SendMessage(type="shutdown_request") to all team members
2. Wait for shutdown_response from each
3. Update session.json with final status and completed_at timestamp
