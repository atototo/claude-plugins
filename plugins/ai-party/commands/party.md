---
description: Analyze a task and auto-assemble the best AI party team
argument-hint: <task or issue description>
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task, TaskCreate, TaskUpdate, TaskList, TeamCreate, SendMessage, AskUserQuestion
---

# /party

자동으로 최적의 팀을 구성하여 파티 모드를 시작한다.

## Protocol

### Step 1: 팀 자동 선택

teams/ 디렉토리의 모든 `.md` 파일을 읽어 YAML frontmatter의 `trigger_keywords`와 `$ARGUMENTS`를 매칭한다.

```
Glob("teams/*.md") → Read each → parse trigger_keywords → score against $ARGUMENTS
```

가장 높은 매칭 팀을 선택한다. 매칭 없으면 동적 팀 구성을 제안한다.

### Step 2: 사용자에게 팀 선택 결과 안내

선택된 팀, 멤버 구성, 워크플로우를 간략히 안내한다.

### Step 3: .party/ 디렉토리 초기화

```
mkdir -p .party/findings .party/approvals
```

session.json 생성:
```json
{
  "id": "party-{team}-{timestamp}",
  "team": "{team}",
  "task": "$ARGUMENTS",
  "status": "ANALYZING",
  "created_at": "{ISO timestamp}",
  "members": [...]
}
```

### Step 4: TeamCreate

```
TeamCreate(team_name="party-{team}-{timestamp}")
```

### Step 5: 워크플로우 단계별 TaskCreate

팀 프리셋의 Workflow 섹션에 따라 태스크를 생성한다. 의존성 체인을 설정한다.

### Step 6: 팀 멤버별 에이전트 스폰

각 에이전트를 `Task(subagent_type, team_name, name)` 으로 스폰한다.
에이전트 프롬프트에 포함:
- 역할과 phase
- 구체적 태스크 지시
- SendMessage 사용법: `SendMessage(type="message", recipient="<name>", content="...", summary="...")`
- TaskUpdate 사용법: 시작 시 `in_progress`, 완료 시 `completed`
- `.party/findings/`에 결과 저장 지시

### Step 7: TaskList 모니터링

TaskList로 단계 진행을 추적한다. 각 단계 완료 시 session.json 상태를 업데이트한다.

### Step 8: 승인 게이트

모든 워크플로우 단계 완료 후:
1. `.party/findings/` 파일들을 수집
2. `git diff --stat` 확인
3. 결과 요약을 사용자에게 제시
4. `.party/approvals/`에 승인 요청 저장

### Step 9: 사용자 응답 처리

- **approve**: 승인 처리, session.json 상태를 APPROVED로 업데이트
- **reject**: 거절 처리, session.json 상태를 REJECTED로 업데이트
- **revise**: 수정 요청 → 해당 에이전트에 재위임

### Step 10: 팀 shutdown

모든 팀원에게 SendMessage(type="shutdown_request")를 전송한다.
session.json 상태를 최종 업데이트한다.

## 사용 예시

```
/party reservation-deploy에서 NPE가 계속 발생하고 있어. 분석하고 수정해줘
/party KR2 클러스터의 CPU 과다 할당 리소스를 찾아서 최적화해줘
/party 새로운 예약 취소 API를 만들어줘
/party 이 코드 분석하고 개선해줘
```
