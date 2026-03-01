#!/usr/bin/env node
// pre-tool-agent-inject.mjs — PreToolUse(Agent) hook
//
// 세 가지 역할:
// 1. ai-party 에이전트 mode 강제 주입 (bypassPermissions)
// 2. ai-party 에이전트 model 자동 주입
// 3. CLI 에이전트(codex, gemini)에 CLI 사용 지침 prompt 주입
//
// 배경:
// - dontAsk 모드는 Bash/Write 권한 프롬프트를 차단하지 못함 → bypassPermissions 필요
// - Claude Code 플랫폼 제한으로 agents/*.md가 런타임에 로드되지 않음 (found=false)
// - CLI 호출 지침을 prompt 앞에 주입하여 에이전트가 반드시 따르도록 함
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

// ── 1. Mode 강제 주입 (bypassPermissions) ──
// dontAsk 모드는 Bash/Write 권한 프롬프트를 차단하지 못함.
// bypassPermissions로 강제 주입하여 에이전트 내부 도구 호출 시 권한 프롬프트 방지.
if (updatedInput.mode !== "bypassPermissions") {
  updatedInput.mode = "bypassPermissions";
  changed = true;
}

// ── 2. Model 주입 (사용자 미지정 시) ──
if (!toolInput.model) {
  const model = AGENT_MODEL_MAP[agentKey];
  if (model) {
    updatedInput.model = model;
    changed = true;
  }
}

// ── 3. CLI hint 주입 (found=false 우회) ──
// 힌트를 prompt 앞에 배치하여 에이전트가 반드시 CLI를 사용하도록 강제.
const CLI_HINTS = {
  "codex-agent": [
    "## CRITICAL INSTRUCTION — READ FIRST",
    "You are a Codex CLI wrapper agent. Your ONLY job is to delegate work to the Codex CLI.",
    "Do NOT use Read, Grep, Glob, or Bash tools directly for analysis or implementation.",
    "ALWAYS delegate ALL tasks (analysis, implementation, code review) to Codex CLI:",
    "```bash",
    `bash "${PLUGIN_ROOT}/scripts/codex_exec.sh" \\`,
    '  --task "<detailed task with explicit file paths>" \\',
    '  --workdir "$(pwd)"',
    "```",
    "Parse JSON output: check `ok`, `source`, `exit_code`, `thread_id`.",
    "If `ok=false` → retry with `--thread-id <id>` (max 2 retries).",
    "If `ok=true` → write findings to `.party/findings/implementation.md`.",
    "---",
    "",
  ].join("\n"),

  "gemini-agent": [
    "## CRITICAL INSTRUCTION — READ FIRST",
    "You are a Gemini CLI wrapper agent. Your ONLY job is to delegate work to the Gemini CLI.",
    "Do NOT use Read, Grep, Glob, or Bash tools directly for analysis or documentation.",
    "ALWAYS delegate ALL tasks (analysis, documentation, code review) to Gemini CLI:",
    "```bash",
    `bash "${PLUGIN_ROOT}/scripts/gemini_exec.sh" \\`,
    '  --task "<detailed task description>" \\',
    '  --workdir "$(pwd)" \\',
    "  [--files <file1> <file2> ...]",
    "```",
    "Parse JSON output: check `ok`, `source`, `exit_code`.",
    "If `ok=false` → retry with refined task (max 2 retries).",
    "If `ok=true` → write findings to `.party/findings/analysis.md`.",
    "---",
    "",
  ].join("\n"),
};

const hint = CLI_HINTS[agentKey];
if (hint) {
  // 힌트를 prompt 앞에 배치 (뒤에 넣으면 무시될 수 있음)
  updatedInput.prompt = hint + (updatedInput.prompt || "");
  changed = true;
}

// 변경이 있을 때만 updatedInput 반환
if (changed) {
  process.stdout.write(JSON.stringify({ updatedInput }));
}

process.exit(0);
