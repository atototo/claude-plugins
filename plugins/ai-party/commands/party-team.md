---
description: Start a party with a specific team preset
argument-hint: <team-name> <task description>
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task, TaskCreate, TaskUpdate, TaskList, TeamCreate, SendMessage, AskUserQuestion
---

# /party-team

지정한 팀으로 파티 모드를 시작한다.

## Protocol

### Step 1: 팀 이름 추출

`$ARGUMENTS`의 첫 번째 단어를 팀 이름으로, 나머지를 태스크로 분리한다.

```
team_name = first word of $ARGUMENTS
task = rest of $ARGUMENTS
```

팀 이름이 없거나 해당 팀 파일이 없으면 사용 가능한 팀 목록을 표시한다:

```
사용 가능한 팀:
- bugfix: 버그 분석 → 수정 → 리뷰 → PR 파이프라인
- devops: K8s 리소스 최적화, 배포, 인프라 설정 변경
- dev-backend: 백엔드 API 설계 → 구현 → 리뷰
- dev-frontend: 프론트엔드 컴포넌트 설계 → 구현 → 분석
```

### Step 2: 팀 프리셋 로드

```
Read("teams/{team_name}.md") → parse frontmatter + workflow
```

### Step 3 이후: /party Step 2부터 동일 흐름

팀 선택이 이미 확정되었으므로 키워드 매칭을 건너뛰고, /party의 Step 2(팀 안내)부터 동일한 흐름을 따른다.

## 사용 예시

```
/party-team bugfix ReportServiceImpl NPE 수정
/party-team devops KR2 클러스터 리소스 최적화
/party-team dev-backend 예약 취소 API 개발
/party-team dev-frontend 대시보드 컴포넌트 개발
```
