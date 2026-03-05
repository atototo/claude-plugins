// approval.mjs — risk classification + approval mode helpers

export const APPROVAL_MODES = {
  PLATFORM: "platform",
  CLI: "cli",
};

// LOW: read-only / orchestration, MEDIUM: source mutation, HIGH: shell/system-destructive
const LOW_RISK_TOOLS = new Set([
  "Read", "Grep", "Glob",
  "Task", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TaskOutput", "TaskStop",
  "Agent", "TeamCreate", "TeamDelete", "SendMessage", "AskUserQuestion", "Skill",
  // Meta/discovery — deferred tool loader, no state mutation
  "ToolSearch",
  // Read-only network — no local state mutation
  "WebFetch", "WebSearch",
  // reasoning-only MCP tool (no side effects)
  "mcp__sequential-thinking__sequentialthinking",
]);

const MEDIUM_RISK_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const HIGH_RISK_TOOLS = new Set(["Bash"]);

function normalizePathLike(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isPartyArtifactPath(filePath) {
  const p = normalizePathLike(filePath);
  const isScopedPath = p.includes("/.party/sessions/") || p.startsWith(".party/sessions/");
  const isScopedApproval = /\.party\/sessions\/[^/]+\/approvals\//.test(p);
  const isScopedSession = /\.party\/sessions\/[^/]+\/session\.json$/.test(p);
  const isScopedFindings = /\.party\/sessions\/[^/]+\/findings\//.test(p);
  const isScopedTickets = /\.party\/sessions\/[^/]+\/tickets\//.test(p);
  const isActiveSession = p.includes("/.party/active-session.json") || p === ".party/active-session.json";
  return (
    isActiveSession ||
    (isScopedPath && (isScopedApproval || isScopedSession || isScopedFindings || isScopedTickets))
  );
}

function extractTargetPath(toolName, toolInput = {}) {
  if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
    return toolInput?.file_path ?? "";
  }
  return "";
}

export function classifyToolRisk(toolName, toolInput = {}) {
  if (LOW_RISK_TOOLS.has(toolName)) return "LOW";
  if (MEDIUM_RISK_TOOLS.has(toolName)) {
    // Pipeline artifact/report writes are considered LOW risk.
    const targetPath = extractTargetPath(toolName, toolInput);
    if (isPartyArtifactPath(targetPath)) return "LOW";
    return "MEDIUM";
  }
  if (HIGH_RISK_TOOLS.has(toolName)) return "HIGH";
  return "MEDIUM";
}

export function resolveApprovalMode(session) {
  const envMode = (process.env.AI_PARTY_APPROVAL_MODE || process.env.APPROVAL_MODE || "").toLowerCase();
  const sessionMode = String(session?.approval_mode || "").toLowerCase();

  if (sessionMode === APPROVAL_MODES.CLI || sessionMode === APPROVAL_MODES.PLATFORM) {
    return sessionMode;
  }
  if (envMode === APPROVAL_MODES.CLI || envMode === APPROVAL_MODES.PLATFORM) {
    return envMode;
  }
  return APPROVAL_MODES.PLATFORM;
}

export function isAutoApproveRisk(riskLevel) {
  return riskLevel === "LOW";
}
