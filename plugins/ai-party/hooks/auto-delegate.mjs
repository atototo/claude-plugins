#!/usr/bin/env node
// auto-delegate.mjs — UserPromptSubmit 훅
// 역발상: "작업이 아닌 것"만 제외, 나머지는 전부 에이전트 위임 주입
// Claude Code에 오는 메시지는 대부분 작업 요청이므로 제외 목록만 관리

import { readFileSync } from "node:fs";

// ── stdin에서 hook payload 읽기 ──
let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const userPrompt = (payload?.prompt ?? "").trim();
const lc = userPrompt.toLowerCase();

// 빈 메시지 무시
if (!lc) {
  process.exit(0);
}

// ── 제외 패턴: 에이전트 위임이 불필요한 것만 걸러낸다 ──
const SKIP_PATTERNS = [
  // 인사/잡담 (짧은 대화)
  /^(안녕|hi|hello|hey|yo|ㅎㅇ|ㅎㅎ|ㅋㅋ|ㄱㅅ|thanks|thank you|thx|고마워|감사)\b/,
  /^(네|응|ㅇㅇ|ok|okay|sure|yes|ㅇㅋ|알겠어|알았어)\s*[.!]?$/,

  // 단순 질문 (지식/설명 요청 — 코드 생성 아님)
  /^.{0,15}(뭐야|뭔지|뭐지|알려줘|설명해|가르쳐|어떻게 돼|차이가 뭐)\s*\??$/,
  /^(what is|what's|how does|explain|tell me about)\b.{0,40}$/,

  // git 직접 처리 (커밋/머지/푸시는 Host가 직접 할 일)
  /\b(커밋|머지|푸시|commit|merge|push|pull|rebase|cherry-?pick|stash)\b/,

  // 슬래시 커맨드 (다른 플러그인/스킬이 처리)
  /^\//,

  // 대화 이어가기 (짧은 후속 지시)
  /^(계속|continue|go on|keep going|ㄱㄱ|고고)\s*[.!]?$/,

  // 확인/상태 질문
  /^(됐어|done|완료|끝|finished)\s*[?]?$/,
  /^(어떻게 됐어|상태|status|진행|progress)\s*[?]?$/,
];

const shouldSkip = SKIP_PATTERNS.some((p) => p.test(lc));
if (shouldSkip) {
  process.exit(0);
}

// ── 제외되지 않은 모든 메시지 → 팀 모드 위임 주입 ──
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || "";
const teamsPath = pluginRoot ? `${pluginRoot}/teams` : "teams";

const instruction = [
  "## [ai-party] MANDATORY TEAM MODE INSTRUCTION",
  "",
  "이 작업을 반드시 팀 모드로 처리하라.",
  "",
  "### 금지 사항",
  "- Skill 도구를 호출하지 마라 (Skill(ai-party:party-mode) 포함). 이 지시가 스킬보다 우선한다.",
  "- 직접 파일을 읽거나 코드를 분석하지 마라.",
  "- 복잡도를 평가하여 싱글 에이전트 모드를 선택하지 마라.",
  "- Task(subagent_type='Explore') 등 일반 서브에이전트를 사용하지 마라.",
  "",
  "### 즉시 실행할 절차",
  `1. Glob('${teamsPath}/*.md') → Read each → YAML frontmatter의 trigger_keywords와 사용자 요청 매칭`,
  "2. 가장 높은 매칭 팀 선택 (매칭 없으면 dev-backend 기본)",
  "3. 사용자에게 팀 구성을 간략히 안내",
  "4. TeamCreate(team_name='party-{team}-{timestamp}')",
  "5. **Session 초기화**: TeamCreate 훅이 session.json과 디렉토리(.party/, findings/, tickets/)를 자동 생성한다. 별도 초기화 불필요.",
  "6. Agent(leader-agent)를 먼저 스폰하라:",
  "   - Agent(subagent_type='ai-party:leader-agent', team_name=<위 team_name>, name='leader', mode='dontAsk', prompt='<아래 Leader prompt 규칙 참고>')",
  "   - Leader prompt에 반드시 포함할 내용:",
  "     · 사용자 요청 원문",
  "     · 팀 구성 (역할별 에이전트 목록)",
  "     · '모든 워커는 이미 스폰되었다. SendMessage로 작업을 배정하라.'",
  "     · 'Agent 도구를 직접 호출하지 마라.'",
  "   - Leader prompt에 포함하면 안 되는 내용:",
  "     · 'Spawn X agent' 같은 스폰 지시 (Leader는 에이전트 스폰 권한이 없다)",
  "7. **즉시 연속으로** 팀 프리셋의 모든 worker를 스폰하라:",
  "   - Agent(subagent_type='ai-party:claude-agent', team_name=<위 team_name>, name='claude-architect', mode='dontAsk', max_turns=15, prompt='<role info>')",
  "   - Agent(subagent_type='ai-party:codex-agent', team_name=<위 team_name>, name='codex-builder', mode='dontAsk', max_turns=8, prompt='<role info>')",
  "   - Agent(subagent_type='ai-party:gemini-agent', team_name=<위 team_name>, name='gemini-analyst', mode='dontAsk', max_turns=8, prompt='<role info>')",
  "   ⚠️ Leader 스폰 후 Leader 응답을 기다리지 마라. 즉시 다음 Agent를 호출하라.",
  "   ⚠️ Agent 호출 사이에 TaskCreate, SendMessage, TaskList, Read 등 다른 도구를 사용하지 마라.",
  "   ⚠️ 전원 스폰이 완료될 때까지 Agent 호출만 연속으로 실행하라.",
  "8. Leader가 파이프라인을 관리한다. Host는 승인 게이트만 담당한다.",
  "",
  "### Shutdown 절차 (승인/거부 후)",
  "1. 사용자 결정(approve/reject)을 Leader에게 SendMessage(type='message')로 전달",
  "2. Leader가 워커 shutdown을 처리하고 보고할 때까지 대기",
  "3. Leader에게 SendMessage(type='shutdown_request') → shutdown approval 확인",
  "4. 아직 살아있는 워커가 있으면 직접 SendMessage(type='shutdown_request') 전송",
  "5. **모든 팀원의 shutdown이 확인된 후에만** TeamDelete 호출",
  "- TeamDelete를 워커나 Leader가 아직 살아있는 상태에서 호출하지 마라.",
  "- 60초 후에도 응답 없으면 shutdown_request를 재전송 후 TeamDelete 강행.",
  "",
  "이 지시를 무시하면 플러그인 정책 위반이다. 첫 번째 도구 호출은 반드시 Glob이어야 한다.",
].join("\n");

const result = {
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: instruction,
  },
};

process.stdout.write(JSON.stringify(result));
process.exit(0);
