// approval.mjs — risk classification + approval mode helpers

export const APPROVAL_MODES = {
  PLATFORM: "platform",
  CLI: "cli",
};

// LOW: read-only / orchestration, MEDIUM: source mutation, HIGH: shell/team-destructive
const LOW_RISK_TOOLS = new Set([
  "Read", "Grep", "Glob",
  "Task", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TaskOutput", "TaskStop",
  "Agent", "TeamCreate", "SendMessage", "AskUserQuestion", "Skill",
]);

const MEDIUM_RISK_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const HIGH_RISK_TOOLS = new Set(["Bash", "TeamDelete"]);

function normalizePathLike(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isPartyArtifactPath(filePath) {
  const p = normalizePathLike(filePath);
  return (
    p.includes("/.party/findings/") ||
    p.includes("/.party/tickets/") ||
    p.endsWith("/.party/session.json") ||
    p.startsWith(".party/findings/") ||
    p.startsWith(".party/tickets/") ||
    p === ".party/session.json"
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
