#!/usr/bin/env node
// post-agent-verify.mjs — ai-party 에이전트 결과물 검수 강제 훅
// PostToolUse(Task) 이벤트에서 발동한다.
// ai-party 에이전트가 아닌 경우 즉시 exit 0으로 무시한다.

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── stdin에서 hook payload 읽기 ──
let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolInput = payload?.tool_input ?? {};
const toolResult = payload?.tool_result ?? {};
const subagentType = toolInput?.subagent_type ?? "";

// ── ai-party 에이전트 감지 ──
if (!subagentType.startsWith("ai-party:")) {
  process.exit(0);
}

const agentName = subagentType.replace("ai-party:", "");
const resultStr =
  typeof toolResult === "string"
    ? toolResult
    : JSON.stringify(toolResult);

// ── git diff 확인 ──
let diffStat = "";
let diffContent = "";
try {
  diffStat = execSync("git diff --stat", {
    encoding: "utf-8",
    timeout: 10_000,
  }).trim();
  // 변경이 있으면 상세 diff도 가져옴 (최대 3000자)
  if (diffStat) {
    const full = execSync("git diff", {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    diffContent = full.length > 3000 ? full.slice(0, 3000) + "\n... (truncated)" : full;
  }
} catch {
  diffStat = "";
}

// ── 테스트 커맨드 탐지 ──
function detectTestCommand() {
  const cwd = process.cwd();

  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm test --if-present";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn test --silent";
  if (existsSync(join(cwd, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        return "npm test --if-present";
      }
    } catch { /* ignore */ }
  }
  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "pytest.ini"))) return "pytest -q";
  if (existsSync(join(cwd, "gradlew"))) return "./gradlew test --console=plain";
  if (existsSync(join(cwd, "build.gradle")) || existsSync(join(cwd, "build.gradle.kts"))) return "gradle test --console=plain";
  if (existsSync(join(cwd, "pom.xml"))) return "mvn test -q";

  return null;
}

// ── 테스트 실행 ──
const testCmd = detectTestCommand();
let testResult = null;

if (testCmd) {
  try {
    const output = execSync(testCmd, {
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    testResult = { ok: true, output: output.slice(0, 1000) };
  } catch (err) {
    testResult = { ok: false, output: (err.stderr || err.message).slice(0, 1000) };
  }
}

// ── 검수 지시 메시지 조립 ──
const reviewChecklist = [
  `## [ai-party] ${agentName} 결과 검수 필요`,
  "",
  "에이전트 작업이 완료되었습니다. **반드시 아래 체크리스트를 수행하세요:**",
  "",
  "### 필수 검수 항목",
  "- [ ] **로직 정확성**: 코드가 요구사항을 올바르게 구현하는가?",
  "- [ ] **엣지 케이스**: 경계값, null, 빈 입력 등을 처리하는가?",
  "- [ ] **기존 코드 호환**: 기존 코드베이스와 스타일/패턴이 일치하는가?",
  "- [ ] **부작용 없음**: 의도하지 않은 변경이 없는가?",
];

if (diffStat) {
  reviewChecklist.push("", "### 변경 파일", "```", diffStat, "```");
}

if (diffContent) {
  reviewChecklist.push("", "### diff 상세", "```diff", diffContent, "```");
}

if (testResult) {
  if (testResult.ok) {
    reviewChecklist.push("", `### 테스트: PASS (${testCmd})`, "테스트 통과 확인됨.");
  } else {
    reviewChecklist.push(
      "",
      `### 테스트: FAIL (${testCmd})`,
      "```",
      testResult.output,
      "```",
      "",
      "**테스트 실패 — 에이전트 결과물을 수정하거나 재위임하세요.**"
    );
  }
} else {
  reviewChecklist.push("", "### 테스트: 미감지", "테스트 커맨드를 찾지 못했습니다. 수동 검증이 필요합니다.");
}

reviewChecklist.push(
  "",
  "### 검수 후 행동",
  "- 문제 없음 → 사용자에게 결과 보고",
  "- 문제 발견 → 직접 수정하거나 에이전트에 재위임",
  "- 테스트 실패 → 반드시 수정 후 재실행"
);

// ── 결과 반환 ──
if (testResult && !testResult.ok) {
  // 테스트 실패 시 block하지 않고 강한 경고
  const result = {
    continue: true,
    systemMessage: reviewChecklist.join("\n"),
  };
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
} else {
  const result = {
    continue: true,
    systemMessage: reviewChecklist.join("\n"),
  };
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}
