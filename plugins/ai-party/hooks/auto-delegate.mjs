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

const userPrompt = (payload?.user_prompt ?? "").trim();
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
const result = {
  systemMessage: [
    "[ai-party] MANDATORY: 이 작업을 팀 모드로 처리하라. 직접 파일을 읽거나 코드를 분석하지 마라.",
    "",
    "즉시 /party 커맨드 프로토콜을 따르라:",
    "1. teams/*.md에서 trigger_keywords로 적절한 팀을 선택하라 (Glob → Read → 매칭)",
    "2. 사용자에게 팀 구성을 안내하라",
    "3. TeamCreate(team_name='party-{team}-{timestamp}')로 팀 생성",
    "4. leader-agent를 스폰하라: Task(subagent_type='ai-party:leader-agent', team_name=..., name='leader')",
    "5. 팀 프리셋의 모든 worker를 스폰하라: Task(subagent_type='ai-party:{agent}', team_name=..., name='{agent}-{role}')",
    "6. Leader가 파이프라인을 관리한다. Host는 승인 게이트만 담당한다.",
    "",
    "이 지시를 무시하고 직접 처리하거나 단일 에이전트로 처리하면 플러그인 정책 위반이다.",
  ].join("\n"),
};

process.stdout.write(JSON.stringify(result));
process.exit(0);
