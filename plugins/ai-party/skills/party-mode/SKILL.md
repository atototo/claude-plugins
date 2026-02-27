---
name: party-mode
description: >
  MUST be invoked for ANY coding task — no exceptions, no complexity judgment.
  Triggers: "code review", "코드 리뷰", "review this code", "코드 생성", "generate code",
  "implement", "구현해줘", "만들어줘", "analyze", "분석", "문서 생성", "documentation",
  "refactor", "리팩토링", "테스트 작성", "write tests", or any task involving code.
  Do NOT evaluate whether the task is "too simple" — the user installed this plugin to use it.
  ALWAYS invoke this skill first, then delegate to agents. Never handle coding tasks directly.
---

<party-mode>

# CRITICAL: You are an orchestrator. Delegate IMMEDIATELY.

**STOP. Do NOT read files. Do NOT write code. Do NOT analyze code yourself.**

Your ONLY job is to classify complexity and spawn the right agent(s) or team. Do this FIRST, before anything else.

## Step 0: Complexity Assessment

Evaluate the task and choose a path:

| Condition | Path |
|-----------|------|
| Multi-step (분석+설계+구현+리뷰 필요)? | **Team Path** → Step 1A |
| User explicitly requests team (`/party`, `/party-team`)? | **Team Path** → Step 1A |
| Single concern (리뷰만, 생성만, 분석만)? | **Single Agent Path** → Step 1B |
| Simple fix (오타, 설정 변경, 1-2줄)? | **Host Direct** (handle yourself) |

## Step 1A: Team Selection (Team Path)

Read `teams/*.md` files and match `trigger_keywords` from YAML frontmatter against the user's task.

| Team | Triggers |
|------|----------|
| bugfix | error, exception, NPE, bug, 에러, 버그, 장애 |
| devops | k8s, resource, deploy, helm, 리소스, 배포 |
| dev-backend | api, endpoint, service, controller, backend |
| dev-frontend | component, UI, 컴포넌트, 페이지, responsive, frontend |

No match? Propose a dynamic team composition using available agents.

## Step 1B: Single Agent Classification (Single Agent Path)

| Task type | Agent to spawn | subagent_type |
|-----------|---------------|---------------|
| Code review, architecture, design decisions | Claude Agent (opus) | `ai-party:claude-agent` |
| Large-scale analysis, docs, log analysis, multi-file review | Gemini Agent (Gemini CLI) | `ai-party:gemini-agent` |
| Single-file code generation, tests, DTOs, utilities | Codex Agent (Codex CLI) | `ai-party:codex-agent` |
| Compound task (review + generate) | Spawn MULTIPLE agents | see patterns below |

## Step 2A: Agent Teams Orchestration (Team Path)

### 2A-1: Initialize .party/

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
  "created_at": "{ISO 8601 timestamp}",
  "members": [
    { "name": "{agent-role}", "agent": "{agent-type}", "role": "{role}" }
  ]
}
```

### 2A-2: Create Team

```
TeamCreate(team_name="party-{team}-{timestamp}")
```

### 2A-3: Create Tasks with Dependencies

Create tasks per workflow phase from the team preset. Set `blockedBy` for dependency chains.

Example for bugfix team:
1. TaskCreate("Analyze bug") — no blockers
2. TaskCreate("Design fix") — blockedBy: [1]
3. TaskCreate("Implement fix") — blockedBy: [2]
4. TaskCreate("Review changes") — blockedBy: [3]

### 2A-4: Spawn Team Members

For each member in the team preset, spawn via Task tool:

```
Task(
  subagent_type="ai-party:{agent}",
  team_name="party-{team}-{timestamp}",
  name="{agent}-{role}",
  prompt="<role prompt with instructions>"
)
```

**Agent prompt template:**

```
You are {agent-name} acting as {role} in the {team} team.

## Your Task
{task description from team preset instructions}

## Team Context
- Team: {team name}
- Your phase: {phase}
- Task: {user's original task}

## Communication
- Use SendMessage(type="message", recipient="<teammate-name>", content="...", summary="...") to communicate with teammates
- Use TaskUpdate(taskId="<id>", status="in_progress") when starting your task
- Use TaskUpdate(taskId="<id>", status="completed") when done
- Write your findings to .party/findings/{finding-file}.md
- Share key findings with specific teammates via SendMessage, not broadcast

## Finding Output
Write your results to .party/findings/{finding-file}.md with:
- Summary (1-2 lines)
- Detailed findings with evidence
- Recommendations or next steps
```

### 2A-5: Monitor Progress

Use TaskList to track workflow phase completion. Update `.party/session.json` status as phases progress:
- ANALYZING → PLANNING → EXECUTING → REVIEWING → AWAITING_APPROVAL

## Step 2B: Single Agent Spawn (Single Agent Path)

Call the Task tool with these parameters:

For **code review / architecture**:
```
Task(subagent_type="ai-party:claude-agent", prompt="<detailed review prompt>", description="Review code")
```

For **analysis / documentation**:
```
Task(subagent_type="ai-party:gemini-agent", prompt="<detailed analysis prompt>", description="Analyze code")
```

For **code generation / tests**:
```
Task(subagent_type="ai-party:codex-agent", prompt="<detailed generation prompt>", description="Generate code")
```

**Compound tasks — spawn multiple agents:**
- "Review and improve" → spawn `ai-party:claude-agent` + `ai-party:codex-agent` in parallel
- "Analyze and document" → spawn `ai-party:gemini-agent` for both
- "Review, then generate tests" → spawn `ai-party:claude-agent` first, then `ai-party:codex-agent`

## Step 3: Approval Gate (Team Path)

When all workflow phases are complete:

1. Collect `.party/findings/*.md` files
2. Run `git diff --stat` for code changes
3. Present summary to user:

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

4. Save approval request to `.party/approvals/`
5. Handle user response:
   - **approve**: Update session.json status to APPROVED
   - **reject**: Update to REJECTED
   - **revise**: Re-delegate to appropriate agent

6. Shutdown team: SendMessage(type="shutdown_request") to all members
7. Update session.json with final status

## Prompt Writing Rules

When writing agent prompts, include:
1. The exact file path(s) to work on
2. The specific task description from the user
3. The expected output format
4. The current working directory

## Fallback: Bash Scripts

If the Task tool is unavailable, use Bash scripts directly:

For Gemini:
```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/gemini_exec.sh" --task "<task>" --workdir "$(pwd)" [--files <file1> <file2>]
```

For Codex:
```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/codex_exec.sh" --task "<task>" --workdir "$(pwd)"
```

## Rules

- NEVER handle code review, generation, or analysis yourself — ALWAYS delegate
- The ONLY exception: security-sensitive logic (auth, encryption, secrets) — handle directly
- After agents complete (single agent path), review their output with `git diff`
- On agent failure (2 retries), fall back to direct editing
- Team path: always go through approval gate before presenting results
- Keep .party/session.json updated throughout the workflow
- Single agent path: post-agent-verify hook handles review checklist injection

</party-mode>
