#!/usr/bin/env node
// pre-tool-agent-inject.mjs — PreToolUse(Agent) hook
//
// 두 가지 역할:
// 1. ai-party 에이전트 model 자동 주입 (기존 pre-tool-model-inject.mjs 대체)
// 2. CLI 에이전트(codex, gemini)에 CLI 사용 지침 prompt 주입
//
// 배경: Claude Code 플랫폼 제한으로 agents/*.md가 런타임에 로드되지 않음 (found=false).
//       agents/*.md에 정의된 CLI 호출 지침이 에이전트에 전달되지 않으므로
//       이 훅에서 spawn 시점에 prompt 필드에 직접 주입한다.
//
// fail-open: 오류 시 exit 0

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_MODEL_MAP } from "../lib/constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, "..");

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = payload?.tool_name ?? "";
const toolInput = payload?.tool_input ?? {};

// Agent 도구가 아니면 무시
if (toolName !== "Agent") {
  process.exit(0);
}

const subagentType = toolInput?.subagent_type ?? "";

// ai-party 프리픽스가 아니면 무시
if (!subagentType.startsWith("ai-party:")) {
  process.exit(0);
}

const agentKey = subagentType.replace("ai-party:", "");
const updatedInput = { ...toolInput };
let changed = false;

// ── 1. Model 주입 (사용자 미지정 시) ──
if (!toolInput.model) {
  const model = AGENT_MODEL_MAP[agentKey];
  if (model) {
    updatedInput.model = model;
    changed = true;
  }
}

// ── 2. CLI hint 주입 (found=false 우회) ──
const CLI_HINTS = {
  "codex-agent": [
    "",
    "## MANDATORY: Codex CLI Usage",
    "You MUST use the Codex CLI wrapper for ALL code implementation tasks.",
    "Do NOT write code directly. ALWAYS delegate to Codex CLI.",
    "```bash",
    `bash "${PLUGIN_ROOT}/scripts/codex_exec.sh" \\`,
    '  --task "<detailed task with explicit file paths>" \\',
    '  --workdir "$(pwd)"',
    "```",
    "Parse JSON output: check `ok`, `source`, `exit_code`, `thread_id`.",
    "If `ok=false` → retry with `--thread-id <id>` (max 2 retries).",
    "If `ok=true` → run `git diff` to verify, then write findings to `.party/findings/implementation.md`.",
  ].join("\n"),

  "gemini-agent": [
    "",
    "## MANDATORY: Gemini CLI Usage",
    "You MUST use the Gemini CLI wrapper for ALL analysis and documentation tasks.",
    "Do NOT analyze code directly. ALWAYS delegate to Gemini CLI.",
    "```bash",
    `bash "${PLUGIN_ROOT}/scripts/gemini_exec.sh" \\`,
    '  --task "<detailed task description>" \\',
    '  --workdir "$(pwd)" \\',
    "  [--files <file1> <file2> ...]",
    "```",
    "Parse JSON output: check `ok`, `source`, `exit_code`.",
    "If `ok=false` → retry with refined task (max 2 retries).",
    "If `ok=true` → process response and write findings to `.party/findings/analysis.md`.",
  ].join("\n"),
};

const hint = CLI_HINTS[agentKey];
if (hint) {
  updatedInput.prompt = (updatedInput.prompt || "") + hint;
  changed = true;
}

// 변경이 있을 때만 updatedInput 반환
if (changed) {
  process.stdout.write(JSON.stringify({ updatedInput }));
}

process.exit(0);
