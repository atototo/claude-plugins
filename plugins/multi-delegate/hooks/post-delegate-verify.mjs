#!/usr/bin/env node
// post-delegate-verify.mjs — Codex/Gemini 위임 결과 통합 검증 훅
// PostToolUse(Bash) 이벤트에서 발동한다.
// 위임 실행이 아닌 경우 즉시 exit 0으로 무시한다.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── stdin에서 hook payload 읽기 ──
let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  // stdin 파싱 실패 → 무시
  process.exit(0);
}

const toolInput = payload?.tool_input ?? {};
const toolResult = payload?.tool_result ?? {};
const command = toolInput?.command ?? "";
const resultStr =
  typeof toolResult === "string"
    ? toolResult
    : JSON.stringify(toolResult);

// ── 위임 실행 감지 ──
function isDelegation(cmd, result) {
  const combined = `${cmd}\n${result}`.toLowerCase();
  const isCodex =
    combined.includes("codex_exec") || combined.includes("codex exec");
  const isGemini =
    combined.includes("gemini_exec") || combined.includes("gemini -p");

  if (isCodex) return { isDelegated: true, source: "codex" };
  if (isGemini) return { isDelegated: true, source: "gemini" };
  return { isDelegated: false, source: null };
}

const delegation = isDelegation(command, resultStr);

// 위임이 아닌 Bash 실행은 무시
if (!delegation.isDelegated) {
  process.exit(0);
}

// ── git diff 확인 ──
let diffStat = "";
try {
  diffStat = execSync("git diff --stat", {
    encoding: "utf-8",
    timeout: 10_000,
  }).trim();
} catch {
  // git이 없거나 repo가 아닌 경우
  diffStat = "";
}

// ── 테스트 커맨드 탐지 ──
function detectTestCommand() {
  const cwd = process.cwd();

  // 1. pnpm
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm test --if-present";
  }
  // 2. yarn
  if (existsSync(join(cwd, "yarn.lock"))) {
    return "yarn test --silent";
  }
  // 3. npm
  if (existsSync(join(cwd, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
      if (
        pkg.scripts?.test &&
        pkg.scripts.test !== 'echo "Error: no test specified" && exit 1'
      ) {
        return "npm test --if-present";
      }
    } catch {
      // 파싱 실패 시 건너뜀
    }
  }
  // 4. pytest
  if (
    existsSync(join(cwd, "pyproject.toml")) ||
    existsSync(join(cwd, "pytest.ini")) ||
    existsSync(join(cwd, "requirements.txt"))
  ) {
    return "pytest -q";
  }
  // 5. gradle
  if (existsSync(join(cwd, "gradlew"))) {
    return "./gradlew test --console=plain";
  }

  return null;
}

// ── 테스트 실행 ──
const testCmd = detectTestCommand();

if (testCmd) {
  try {
    execSync(testCmd, {
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // 테스트 통과
    const result = {
      continue: true,
      systemMessage: `[${delegation.source}] Delegation verification passed. Tests OK. diff: ${diffStat || "no changes"}. Proceed with code review.`,
    };
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    // 테스트 실패 → block
    const result = {
      decision: "block",
      reason: `[${delegation.source}] Tests failed after delegation.\n\nTest command: ${testCmd}\nError: ${err.stderr || err.message}\n\nDiff:\n${diffStat}`,
    };
    process.stdout.write(JSON.stringify(result));
    process.exit(2);
  }
} else {
  // 테스트 미감지 → continue with warning
  const result = {
    continue: true,
    systemMessage: `[${delegation.source}] Delegation completed. No test command detected. diff: ${diffStat || "no changes"}. Proceed with manual code review.`,
  };
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}
