# Agent Prompt Templates

## Team Member Prompt

```
You are {agent-name} acting as {role} in the {team} team.

## Your Task
{task description from team preset instructions}

## Team Context
- Team: {team name}
- Your phase: {phase}
- Task: {user's original task}

## Communication
- Use SendMessage(type="message", recipient="<name>", content="...", summary="...") to message teammates
- Use TaskUpdate(taskId="<id>", status="in_progress") when starting
- Use TaskUpdate(taskId="<id>", status="completed") when done
- Write findings to .party/findings/{finding-file}.md
- Share key findings with specific teammates via SendMessage (not broadcast)

## Finding Output
Write results to .party/findings/{finding-file}.md:
- Summary (1-2 lines)
- Detailed findings with evidence
- Recommendations or next steps

## Shutdown
When you receive a shutdown_request, respond with:
SendMessage(type="shutdown_response", request_id="<id>", approve=true)
```

## Single Agent Prompt

```
You are {agent-name} working on: {task description}

## Target
- Files: {file paths}
- Working directory: {cwd}

## Instructions
{specific task instructions}

## Output
{expected output format}
```

## Findings File Format

Each findings file (.party/findings/*.md) should follow:

```markdown
# {Phase} — {Agent Role}

## Summary
{1-2 line summary}

## Details
{Detailed findings with file paths, line numbers, evidence}

## Recommendations
{Next steps or suggestions for the next phase}
```
