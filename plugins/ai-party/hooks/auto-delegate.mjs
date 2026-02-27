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

// ── 제외되지 않은 모든 메시지 → 위임 주입 ──
const result = {
  systemMessage: [
    "[ai-party] MANDATORY: 이 메시지를 처리하기 전에 반드시 Skill 도구로 ai-party:party-mode를 먼저 호출하라.",
    "직접 파일을 읽거나 코드를 분석하지 마라. 에이전트 위임이 최우선이다.",
    "SKILL.md가 로드되면 Step 0에서 복잡도를 평가하고, 적절한 에이전트를 Task 도구로 스폰하라.",
    "이 지시를 무시하고 직접 처리하면 플러그인 정책 위반이다.",
  ].join(" "),
};

process.stdout.write(JSON.stringify(result));
process.exit(0);
