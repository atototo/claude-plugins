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
import { readSession } from "../lib/session.mjs";

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
const session = readSession();
const runtimeRoot = session?.runtime_root || (session?.id ? `.party/sessions/${session.id}` : ".party/sessions/unknown");

function resolveRoleFromName(name = "") {
  const value = String(name || "");
  const known = [
    "security-auditor",
    "researcher",
    "architect",
    "reviewer",
    "builder",
    "analyst",
    "deployer",
    "leader",
  ];
  for (const role of known) {
    if (value === role || value.startsWith(`${role}-`)) return role;
  }
  return "";
}

function resolveRoleFromSessionMember(name = "") {
  const session = readSession();
  if (!session || !Array.isArray(session.members)) return "";
  const member = session.members.find((m) => String(m?.name || "") === String(name || ""));
  if (!member) return "";
  return resolveRoleFromName(member.role || member.agent || member.name || "");
}

// Agent 이름/세션 멤버 기준으로 역할 보정 (예: reviewer-*가 analyst로 스폰되는 회귀 방지)
const requestedName = String(updatedInput?.name || "");
const roleFromName = resolveRoleFromName(requestedName);
const roleFromSession = resolveRoleFromSessionMember(requestedName);
const correctedRole = roleFromSession || roleFromName || agentKey;

if (correctedRole && correctedRole !== agentKey) {
  updatedInput.subagent_type = `ai-party:${correctedRole}`;
  changed = true;
}

const effectiveAgentKey = (updatedInput.subagent_type || subagentType).replace("ai-party:", "");

// ── 1. Mode 강제 주입 (bypassPermissions) ──
// dontAsk 모드는 Bash/Write 권한 프롬프트를 차단하지 못함.
// bypassPermissions로 강제 주입하여 에이전트 내부 도구 호출 시 권한 프롬프트 방지.
if (updatedInput.mode !== "bypassPermissions") {
  updatedInput.mode = "bypassPermissions";
  changed = true;
}

// ── 2. Model 강제 주입 (AGENT_MODEL_MAP 우선) ──
// Host LLM이 model을 명시하든 안 하든 항상 AGENT_MODEL_MAP 값으로 강제
const model = AGENT_MODEL_MAP[effectiveAgentKey];
if (model) {
  updatedInput.model = model;
  changed = true;
}

// ── 3. CLI hint 주입 (deprecated 에이전트 전용, found=false 우회) ──
// v0.9.0: 역할 기반 에이전트는 Claude 네이티브 도구를 직접 사용.
// CLI hint는 deprecated 에이전트(codex-agent, gemini-agent)에만 적용.
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
    `If \`ok=true\` → write findings to \`${runtimeRoot}/findings/implementation.md\`.`,
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
    `If \`ok=true\` → write findings to \`${runtimeRoot}/findings/analysis.md\`.`,
    "---",
    "",
  ].join("\n"),
};

// CLI hint는 deprecated 에이전트에만 적용 (v0.9.0 역할 에이전트는 네이티브 도구 사용)
const hint = CLI_HINTS[effectiveAgentKey];
const runtimeHint = [
  "## RUNTIME ROOT (MANDATORY)",
  `Use this exact runtime root for all session files: ${runtimeRoot}`,
  `Session file: ${runtimeRoot}/session.json`,
  `Findings dir: ${runtimeRoot}/findings`,
  `Tickets dir: ${runtimeRoot}/tickets`,
  "Only use paths under the runtime root above.",
  "",
].join("\n");
if (hint) {
  updatedInput.prompt = runtimeHint + hint + (updatedInput.prompt || "");
  changed = true;
} else {
  updatedInput.prompt = runtimeHint + (updatedInput.prompt || "");
  changed = true;
}

// 변경이 있을 때만 updatedInput 반환
if (changed) {
  process.stdout.write(JSON.stringify({ updatedInput }));
}

process.exit(0);
