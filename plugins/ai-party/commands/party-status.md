---
description: Check the current party session status
allowed-tools: Read, Glob, TaskList
---

# /party-status

현재 파티 세션의 진행 상황을 표시한다.

## Protocol

### Step 1: 세션 확인

`.party/session.json`을 읽는다. 파일이 없으면 "활성 파티 세션이 없습니다"를 표시한다.

### Step 2: 상태 표시

session.json에서 다음 정보를 표시한다:

```
파티 세션: {id}
팀: {team}
태스크: {task}
상태: {status}
시작: {created_at}
```

TaskList로 현재 단계별 태스크 상태를 표시한다:

```
워크플로우 진행:
  ANALYZING  [완료] gemini-agent(analyst), claude-agent(architect)
  PLANNING   [진행중] claude-agent(architect)
  EXECUTING  [대기] codex-agent(builder)
  REVIEWING  [대기] claude-agent(reviewer)
  APPROVAL   [대기]
```

### Step 3: Finding 진행률

`.party/findings/` 디렉토리의 파일 존재 여부로 진행률을 표시한다:

```
Findings:
  [x] analysis.md
  [x] design.md
  [ ] implementation.md
  [ ] review.md
```

### Step 4: 승인 대기

`.party/approvals/` 에 파일이 있으면 승인 대기 중임을 강조한다.
