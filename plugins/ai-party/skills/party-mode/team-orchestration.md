# Team Orchestration Protocol

## Team Selection

Read `teams/*.md` files and match `trigger_keywords` from YAML frontmatter:

| Team | Triggers |
|------|----------|
| bugfix | error, exception, NPE, bug, 에러, 버그, 장애 |
| devops | k8s, resource, deploy, helm, 리소스, 배포 |
| dev-backend | api, endpoint, service, controller, backend |
| dev-frontend | component, UI, 컴포넌트, 페이지, responsive, frontend |

No match? Propose a dynamic team composition using available agents.

## Initialize .party/

```bash
mkdir -p .party/findings .party/approvals
```

Create `.party/session.json`:
```json
{
  "id": "party-{team}-{YYYYMMDD}-{HHmmss}",
  "team": "{team}",
  "task": "{user task description}",
  "status": "ANALYZING",
  "created_at": "{ISO 8601}",
  "members": [
    { "name": "{agent-role}", "agent": "{agent-type}", "role": "{role}" }
  ]
}
```

## Create Team

```
TeamCreate(team_name="party-{team}-{timestamp}")
```

## Create Tasks with Dependencies

Per workflow phase from team preset, use `blockedBy` for dependency chains.

Example (bugfix team):
1. TaskCreate("Analyze bug") — no blockers
2. TaskCreate("Design fix") — blockedBy: [1]
3. TaskCreate("Implement fix") — blockedBy: [2]
4. TaskCreate("Review changes") — blockedBy: [3]

## Spawn Team Members

For each member, use the prompt template from [prompt-templates.md](prompt-templates.md):

```
Task(
  subagent_type="ai-party:{agent}",
  team_name="party-{team}-{timestamp}",
  name="{agent}-{role}",
  prompt="<from prompt template>"
)
```

## Monitor Progress

Use TaskList to track phase completion. Update `.party/session.json` status:

```
ANALYZING → PLANNING → EXECUTING → REVIEWING → AWAITING_APPROVAL
```

When all phases complete, proceed to [approval-gate.md](approval-gate.md).

## Shutdown

After approval/rejection:
1. SendMessage(type="shutdown_request") to all members
2. Update session.json with final status (APPROVED / REJECTED)
