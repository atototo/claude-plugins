// constants.mjs — ai-party Phase 3 shared constants

// ── Pipeline states ──
export const STATES = {
  IDLE: "IDLE",
  ANALYZING: "ANALYZING",
  PLANNING: "PLANNING",
  EXECUTING: "EXECUTING",
  REVIEWING: "REVIEWING",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REVISION: "REVISION",
  DONE: "DONE",
  ROLLED_BACK: "ROLLED_BACK",
  FAILED: "FAILED",
};

// ── Tools blocked during active pipeline phases ──
export const BLOCKED_TOOLS = new Set([
  "Read", "Edit", "Write", "MultiEdit", "Bash", "Grep", "Glob",
]);

// ── Always allowed (orchestration tools) ──
export const ALLOWED_TOOLS = new Set([
  "Task", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet",
  "TeamCreate", "TeamDelete", "SendMessage", "AskUserQuestion",
  "Skill", "TaskOutput", "TaskStop",
]);

// ── States where Host can use tools directly ──
export const HOST_DIRECT_STATES = new Set([
  STATES.IDLE,
  STATES.AWAITING_APPROVAL,
  STATES.APPROVED,
  STATES.REJECTED,
  STATES.DONE,
  STATES.ROLLED_BACK,
  STATES.FAILED,
]);

// ── Agent → model mapping ──
export const AGENT_MODEL_MAP = {
  "leader-agent": "opus",
  "claude-agent": "opus",
  "gemini-agent": "sonnet",
  "codex-agent": "sonnet",
};

// ── Session / artifact paths ──
export const PARTY_DIR = ".party";
export const SESSION_FILE = ".party/session.json";
export const FINDINGS_DIR = ".party/findings";

// ── Fix loop limit ──
export const MAX_FIX_ATTEMPTS = 3;
