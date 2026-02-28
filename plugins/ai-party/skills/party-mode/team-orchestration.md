# Team Orchestration Protocol

## Architecture

```
사용자 ⇄ Host (supervisor) ⇄ Leader (orchestrator) ⇄ Workers (specialists)
```

- **Host**: 팀 생성, 전원 스폰, 사용자와의 인터페이스, 최종 승인 게이트
- **Leader**: 파이프라인 관리, 태스크 생성/할당, 상태 전환, findings 수집
- **Workers**: 분석, 설계, 구현, 리뷰 등 실제 작업 수행

**제약사항**: 공식 Agent Teams 스펙에 따라 팀원은 다른 팀원을 스폰할 수 없다.
따라서 Host가 leader와 모든 worker를 직접 스폰한다.

## Team Selection

Read `teams/*.md` files and match `trigger_keywords` from YAML frontmatter:

| Team | Triggers |
|------|----------|
| bugfix | error, exception, NPE, bug, 에러, 버그, 장애 |
| devops | k8s, resource, deploy, helm, 리소스, 배포 |
| dev-backend | api, endpoint, service, controller, backend |
| dev-frontend | component, UI, 컴포넌트, 페이지, responsive, frontend |

No match? Propose a dynamic team composition using available agents.

## Initialize Team

### Host creates team and spawns all members:

```
TeamCreate(team_name="party-{team}-{timestamp}")
```

### Spawn leader:
```
Task(
  subagent_type="ai-party:leader-agent",
  team_name="party-{team}-{timestamp}",
  name="leader",
  prompt="<team info, member list, workflow, task>"
)
```

### Spawn workers (per team preset):
```
Task(
  subagent_type="ai-party:{agent}",
  team_name="party-{team}-{timestamp}",
  name="{agent}-{role}",
  prompt="<from prompt template, with instruction to wait for leader>"
)
```

## Leader Manages Pipeline

Leader handles the full pipeline independently:

1. Creates `.party/` directory and `session.json`
2. Creates tasks per workflow with dependencies (TaskCreate + addBlockedBy)
3. Sends instructions to workers (SendMessage)
4. Monitors progress (TaskList)
5. Transitions state at phase boundaries (state-cli.mjs)
6. Collects findings and reports to Host

## State Transitions (Leader responsibility)

```
IDLE → ANALYZING → PLANNING → EXECUTING → REVIEWING → AWAITING_APPROVAL
```

Leader uses `state-cli.mjs`:
```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/state-cli.mjs" transition {STATE} "{reason}"
```

## Approval Gate

When leader reports completion, Host:
1. Reads `.party/findings/` files
2. Checks `git diff --stat`
3. Presents summary to user (see [approval-gate.md](approval-gate.md))
4. Sends user decision to leader via SendMessage

## Shutdown

After approval/rejection:
1. Leader sends shutdown_request to all workers
2. Host sends shutdown_request to leader
3. Host runs TeamDelete
