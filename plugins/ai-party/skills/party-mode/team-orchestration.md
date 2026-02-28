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

**Host가 결정론적 코드로 session.json을 생성한다. Leader에게 맡기지 않는다.**

### Step 1: TeamCreate
```
TeamCreate(team_name="party-{team}-{timestamp}")
```

### Step 2: Session 초기화 (Bash — Leader 스폰 전에 반드시 실행)
```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/session-cli.mjs" init \
  --team "{team}" \
  --task "{user task description}" \
  --members '[{"name":"leader","agent":"leader-agent","role":"orchestrator"},{"name":"{worker1}","agent":"{agent1}","role":"{role1}"}]'
```
이 명령이 `.party/`, `.party/findings/`, `.party/tickets/` 디렉토리와 `session.json`을 생성한다.

### Step 3: Spawn leader
```
Agent(
  subagent_type="ai-party:leader-agent",
  team_name="party-{team}-{timestamp}",
  name="leader",
  prompt="<team info, member list, workflow, task>"
)
```

### Step 4: Spawn workers (per team preset)
```
Agent(
  subagent_type="ai-party:{agent}",
  team_name="party-{team}-{timestamp}",
  name="{agent}-{role}",
  prompt="<from prompt template, with instruction to wait for leader>"
)
```

## Leader Manages Pipeline

Leader handles the pipeline. **session.json은 Host가 이미 생성했다.**

1. 상태 전환으로 파이프라인 시작 (`state-cli.mjs transition ANALYZING`)
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

## Shutdown Protocol

**핵심 원칙: 모든 팀원이 종료를 확인할 때까지 TeamDelete를 호출하지 마라.**

워커가 장시간 API 호출 중이면 inbox를 읽을 수 없다.
Shutdown approval은 워커의 현재 턴이 끝나야 처리된다.

### Shutdown Sequence (Host 기준)

1. **사용자 결정 전달**: Leader에게 approve/reject 결정을 SendMessage
2. **Leader가 워커 shutdown 처리**: Leader가 모든 워커에게 shutdown_request 전송
3. **Leader 완료 대기**: Leader가 idle 또는 shutdown approval 올 때까지 대기
4. **잔여 워커 확인**: Leader shutdown 후, 아직 살아있는 워커가 있으면 Host가 직접 shutdown_request 전송
5. **전원 종료 확인**: 모든 teammate idle notification 또는 shutdown approval을 수신할 때까지 대기 (최대 60초)
6. **TeamDelete**: 모든 팀원이 제거된 후에만 TeamDelete 호출

### Timeout 처리

- 60초 후에도 응답 없는 워커가 있으면, 해당 워커에게 shutdown_request를 한 번 더 전송
- 그래도 응답 없으면 TeamDelete 강행 (orphan 프로세스는 자동 만료됨)

### 실패 방지 체크리스트

- [ ] Leader shutdown 전에 TeamDelete 금지
- [ ] 워커 전원 shutdown 확인 전에 TeamDelete 금지
- [ ] Shutdown 메시지는 반드시 `type: "shutdown_request"` 사용 (일반 message 금지)
