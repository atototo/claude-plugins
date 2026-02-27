#!/usr/bin/env node
// auto-delegate.mjs — UserPromptSubmit 훅
// 사용자 메시지에서 코딩 키워드 감지 → ai-party 위임 지시 주입
// 코딩 작업이 아니면 무시 (exit 0, 출력 없음)

import { readFileSync } from "node:fs";

// ── stdin에서 hook payload 읽기 ──
let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const userPrompt = (payload?.user_prompt ?? "").toLowerCase();

// 빈 메시지 무시
if (!userPrompt.trim()) {
  process.exit(0);
}

// ── 코딩 키워드 패턴 ──
const CODING_PATTERNS = [
  // 한국어
  /리뷰/, /분석/, /수정/, /만들어/, /생성/, /구현/, /코드/,
  /테스트/, /리팩토링/, /리팩터/, /디버그/, /버그/,
  /최적화/, /개선/, /문서화/, /타입/, /인터페이스/,
  /컴포넌트/, /함수/, /클래스/, /모듈/, /API/i,
  /작성/, /추가/, /삭제/, /변경/, /이동/,
  /빌드/, /배포/, /설정/, /마이그레이션/,
  // 영어
  /\breview\b/, /\banalyze\b/, /\bfix\b/, /\bcreate\b/,
  /\bimplement\b/, /\bgenerate\b/, /\bdebug\b/,
  /\brefactor\b/, /\btest\b/, /\boptimize\b/,
  /\bbuild\b/, /\bdeploy\b/, /\bmigrat/,
  /\bwrite\b.*\b(code|test|func|class|component)/,
  /\badd\b.*\b(feature|endpoint|route|handler|test)/,
  // 파일 패턴
  /\.(ts|js|py|java|go|rs|cpp|c|rb|php|swift|kt)\b/,
  /\.(tsx|jsx|vue|svelte)\b/,
  /\.(json|yaml|yml|toml|xml)\b.*\b(수정|변경|추가|fix|update|add)/,
];

// ── 제외 패턴 (일반 질문, 대화) ──
const EXCLUDE_PATTERNS = [
  /^(안녕|hi|hello|hey)\b/,
  /뭐야\??$/, /뭐해\??$/,
  /알려줘$/, /설명해줘$/, /가르쳐줘$/,
  /\b(what|how|why|when|where)\b.*\?$/,
  /커밋/, /머지/, /푸시/, /git/,  // git 작업은 직접 처리
];

// ── 판단 로직 ──
const isExcluded = EXCLUDE_PATTERNS.some((p) => p.test(userPrompt));
if (isExcluded) {
  process.exit(0);
}

const isCodingTask = CODING_PATTERNS.some((p) => p.test(userPrompt));
if (!isCodingTask) {
  process.exit(0);
}

// ── 위임 지시 주입 ──
const result = {
  systemMessage: [
    "[ai-party] 코딩 작업 감지됨.",
    "Skill 도구로 ai-party:party-mode를 먼저 호출한 뒤, SKILL.md의 지시에 따라 적절한 에이전트에 위임하라.",
    "간단한 1-2줄 수정이 아닌 한, 직접 처리하지 말고 에이전트를 활용하라.",
  ].join(" "),
};

process.stdout.write(JSON.stringify(result));
process.exit(0);
