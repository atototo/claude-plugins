---
description: Analyze a task and auto-assemble the best AI party team
argument-hint: <task or issue description>
allowed-tools: Bash, Read, Write, Grep, Glob, Task, TaskCreate, TaskUpdate, TaskList, TeamCreate, SendMessage, AskUserQuestion
---

# /party

자동으로 최적의 팀을 구성하여 파티 모드를 시작한다.
Host는 **supervisor** 역할만 수행하고, leader-agent가 파이프라인을 관리한다.

## Protocol

### Step 1: 팀 자동 선택

teams/ 디렉토리의 모든 `.md` 파일을 읽어 YAML frontmatter의 `trigger_keywords`와 `$ARGUMENTS`를 매칭한다.

```
Glob("teams/*.md") → Read each → parse trigger_keywords → score against $ARGUMENTS
```

가장 높은 매칭 팀을 선택한다. 매칭 없으면 동적 팀 구성을 제안한다.

### Step 2: 사용자에게 팀 선택 결과 안내

선택된 팀, 멤버 구성, 워크플로우를 간략히 안내한다.
Leader가 파이프라인을 관리하고, Host는 최종 승인만 담당함을 설명한다.

### Step 3: TeamCreate

```
TeamCreate(team_name="party-{team}-{timestamp}")
```

### Step 4: Leader + Worker 전원 스폰

공식 Agent Teams 제약사항: **팀원은 다른 팀원을 스폰할 수 없다.**
따라서 Host가 leader와 모든 worker를 직접 스폰한다.

#### Leader 스폰

```
Task(
  subagent_type="ai-party:leader-agent",
  team_name="party-{team}-{timestamp}",
  name="leader",
  prompt="You are the pipeline leader for the {team} team.

## Task
{$ARGUMENTS}

## Team Members (already spawned by Host)
{각 worker의 name, agent, role, phase 목록}

## Team Preset Workflow
{팀 프리셋의 Workflow 섹션 전체}

## Your Job
1. Initialize .party/ directory and session.json
2. Create tasks per workflow with dependencies (TaskCreate + addBlockedBy)
3. Send work instructions to each worker via SendMessage
4. Monitor progress via TaskList
5. Transition pipeline state at each phase boundary (state-cli.mjs)
6. When all phases complete, collect findings and report to me (team-lead) for user approval
7. Wait for my approval/rejection/revision decision
8. Handle the decision and shutdown workers

Refer to your agent definition for detailed protocol."
)
```

#### Worker 스폰

팀 프리셋의 Members 섹션에 따라 각 worker를 스폰한다:

```
Task(
  subagent_type="ai-party:{agent}",
  team_name="party-{team}-{timestamp}",
  name="{agent}-{role}",
  prompt="You are {agent-name} acting as {role} in the {team} team.

## Your Task
{team preset의 해당 멤버 Instructions}

## Team Context
- Team: party-{team}-{timestamp}
- Your phase: {phase}
- Task: {$ARGUMENTS}
- Leader: 'leader' — wait for instructions from the leader

## Communication
- Use SendMessage(type='message', recipient='<name>', content='...', summary='...') to message teammates
- Use TaskUpdate(taskId='<id>', status='in_progress') when starting
- Use TaskUpdate(taskId='<id>', status='completed') when done
- Write findings to .party/findings/{finding-file}.md

## Important
- Wait for the leader's SendMessage before starting work
- The leader will tell you your task ID and specific instructions
- When done, mark your task as completed and notify the leader

## Shutdown
When you receive a shutdown_request, respond with:
SendMessage(type='shutdown_response', request_id='<id>', approve=true)"
)
```

### Step 5: 대기 — Leader가 파이프라인 관리

Host는 leader의 보고를 기다린다. Leader가 SendMessage로 다음을 보고한다:
- 진행 상황 업데이트 (선택적)
- 최종 결과 요약 + 승인 요청

Host는 이 시간 동안 **직접 도구를 사용하지 않는다**.
TaskList로 가끔 진행 상황을 확인할 수 있다.

### Step 6: 승인 게이트

Leader가 승인 요청을 보내면:
1. `.party/findings/` 파일들을 읽어 확인
2. `git diff --stat` 확인
3. 결과 요약을 사용자에게 제시
4. `.party/approvals/`에 승인 요청 저장

```
════════════════════════════════════════
PARTY RESULT — {team} team
════════════════════════════════════════
Task: {original task}

Analysis: {summary}
Design: {summary}
Implementation: {summary + files changed}
Review: {summary}
════════════════════════════════════════
  approve / reject / revise
════════════════════════════════════════
```

### Step 7: 사용자 응답 처리

사용자 결정을 Leader에게 전달:

```
SendMessage(
  type="message",
  recipient="leader",
  content="User decision: {approve|reject|revise}. {추가 지시사항}",
  summary="User {decision}"
)
```

Leader가 결정을 처리하고 워커 shutdown을 관리한다.

### Step 8: 팀 정리

Leader가 모든 워커를 shutdown한 후:
1. Leader에게 SendMessage(type="shutdown_request")
2. TeamDelete로 팀 리소스 정리

## 사용 예시

```
/party reservation-deploy에서 NPE가 계속 발생하고 있어. 분석하고 수정해줘
/party KR2 클러스터의 CPU 과다 할당 리소스를 찾아서 최적화해줘
/party 새로운 예약 취소 API를 만들어줘
/party 이 코드 분석하고 개선해줘
```
