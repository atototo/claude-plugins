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
  "Task", "Agent", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet",
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
// v0.9.0: Role-based agents (primary)
// Legacy AI-unit names kept for backward compatibility (remove in v1.0.0)
export const AGENT_MODEL_MAP = {
  // v0.9.0 role-based agents
  "leader": "opus",
  "architect": "opus",
  "reviewer": "opus",
  "security-auditor": "opus",
  "analyst": "sonnet",
  "builder": "sonnet",
  "researcher": "sonnet",
  "deployer": "sonnet",
  // Legacy (deprecated — backward compat until v1.0.0)
  "leader-agent": "opus",
  "claude-agent": "opus",
  "gemini-agent": "sonnet",
  "codex-agent": "sonnet",
};

// ── Session / artifact paths ──
export const PARTY_DIR = ".party";
export const SESSION_FILE = ".party/session.json";
export const FINDINGS_DIR = ".party/findings";
export const TICKETS_DIR = ".party/tickets";
export const EVENTS_FILE = ".party/events.ndjson";

// ── Fix loop limit ──
export const MAX_FIX_ATTEMPTS = 3;

// ── Ticket statuses ──
export const TICKET_STATUSES = {
  BLOCKED: "BLOCKED",
  TODO: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
};

// ── Event types (events.ndjson) ──
export const EVENT_TYPES = {
  PIPELINE_STARTED: "pipeline_started",
  PIPELINE_COMPLETED: "pipeline_completed",
  PHASE_CHANGED: "phase_changed",
  TICKET_CREATED: "ticket_created",
  TICKET_UPDATED: "ticket_updated",
  FINDINGS_SUBMITTED: "findings_submitted",
  APPROVAL_REQUESTED: "approval_requested",
  DECISION_MADE: "decision_made",
  AGENT_SPAWNED: "agent_spawned",
  AGENT_COMPLETED: "agent_completed",
  TEAM_SPAWN_VERIFIED: "team_spawn_verified",
  ERROR_OCCURRED: "error_occurred",
};
