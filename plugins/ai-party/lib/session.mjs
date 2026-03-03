// session.mjs — session read/write/status utilities
//
// canonical storage: .party/sessions/<sessionId>/session.json
// active pointer: .party/active-session.json

import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJSON } from "./atomic-write.mjs";
import {
  PARTY_DIR,
  STATES,
  SESSIONS_DIR,
  ACTIVE_SESSION_FILE,
} from "./constants.mjs";

function activeSessionPath(cwd = process.cwd()) {
  return join(cwd, ACTIVE_SESSION_FILE);
}

function sessionsDirPath(cwd = process.cwd()) {
  return join(cwd, SESSIONS_DIR);
}

export function sessionDirForId(sessionId, cwd = process.cwd()) {
  if (!sessionId) return null;
  return join(sessionsDirPath(cwd), String(sessionId));
}

export function sessionFileForId(sessionId, cwd = process.cwd()) {
  const dir = sessionDirForId(sessionId, cwd);
  if (!dir) return null;
  return join(dir, "session.json");
}

function parseJsonFile(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function readActiveSessionIdFile(cwd = process.cwd()) {
  const obj = parseJsonFile(activeSessionPath(cwd));
  const id = String(obj?.session_id || "").trim();
  return id || null;
}

function writeActiveSessionIdFile(sessionId, cwd = process.cwd()) {
  if (!sessionId) return;
  mkdirSync(join(cwd, PARTY_DIR), { recursive: true });
  atomicWriteJSON(activeSessionPath(cwd), {
    session_id: String(sessionId),
    updated_at: new Date().toISOString(),
  });
}

function listSessionIds(cwd = process.cwd()) {
  const dir = sessionsDirPath(cwd);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((ent) => ent.isDirectory())
      .map((ent) => ent.name)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readScopedSession(sessionId, cwd = process.cwd()) {
  const path = sessionFileForId(sessionId, cwd);
  return parseJsonFile(path);
}

export function readActiveSessionId(cwd = process.cwd()) {
  const envId = String(process.env.AI_PARTY_SESSION_ID || "").trim();
  if (envId) return envId;
  return readActiveSessionIdFile(cwd);
}

export function setActiveSessionId(sessionId, cwd = process.cwd()) {
  writeActiveSessionIdFile(sessionId, cwd);
}

export function scopedPathInSession(sessionId, relativePath, cwd = process.cwd()) {
  const dir = sessionDirForId(sessionId, cwd);
  if (!dir) return join(cwd, relativePath);
  return join(dir, relativePath);
}

export function scopedFindingsDir(cwd = process.cwd(), sessionId = null) {
  const id = String(sessionId || readActiveSessionId(cwd) || "").trim();
  if (!id) return join(cwd, PARTY_DIR, "sessions", "unknown", "findings");
  return scopedPathInSession(id, "findings", cwd);
}

export function scopedTicketsDir(cwd = process.cwd(), sessionId = null) {
  const id = String(sessionId || readActiveSessionId(cwd) || "").trim();
  if (!id) return join(cwd, PARTY_DIR, "sessions", "unknown", "tickets");
  return scopedPathInSession(id, "tickets", cwd);
}

/**
 * Read session.json from cwd. Returns null if not found.
 */
export function readSession(cwd = process.cwd(), opts = {}) {
  const explicitId = String(opts?.sessionId || "").trim();
  if (explicitId) {
    const scoped = readScopedSession(explicitId, cwd);
    if (scoped) return scoped;
  }

  const activeId = readActiveSessionId(cwd);
  if (activeId) {
    const scoped = readScopedSession(activeId, cwd);
    if (scoped) return scoped;
  }

  // Strict session isolation: no active pointer means no active session.
  return null;
}

/**
 * Write session.json atomically.
 */
export function writeSession(session, cwd = process.cwd(), opts = {}) {
  const sessionId = String(session?.id || "").trim();
  if (!sessionId) {
    return;
  }

  const scopedDir = sessionDirForId(sessionId, cwd);
  const scopedFile = sessionFileForId(sessionId, cwd);
  mkdirSync(scopedDir, { recursive: true });
  mkdirSync(join(scopedDir, "approvals"), { recursive: true });
  mkdirSync(join(scopedDir, "findings"), { recursive: true });
  mkdirSync(join(scopedDir, "tickets"), { recursive: true });
  atomicWriteJSON(scopedFile, session);

  const activate = opts?.activate !== false;
  if (activate) {
    writeActiveSessionIdFile(sessionId, cwd);
  }
}

/**
 * Create a fresh session object.
 */
export function createSession({ team, task, members = [] }) {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return {
    id: `party-${team}-${ts}`,
    team,
    task,
    phase: STATES.IDLE,
    phase_history: [],
    execution: {
      workers_total: members.length,
      workers_active: 0,
      tasks_total: 0,
      tasks_completed: 0,
    },
    fix_loop: { attempt: 0, max_attempts: 3 },
    cancel: { requested: false, preserve_for_resume: false },
    artifacts: {
      analysis_path: null,
      design_path: null,
      implementation_path: null,
      review_path: null,
    },
    members: members.map((m) => ({ ...m, spawned: false })),
    created_at: new Date().toISOString(),
  };
}

/**
 * Validate session has correct schema (required fields).
 */
export function isSessionValid(session) {
  if (!session) return false;
  return !!(session.id && session.phase && Array.isArray(session.members));
}

/**
 * Check if session is stale (older than maxAgeMs, default 4 hours).
 */
export function isSessionStale(session, maxAgeMs = 4 * 60 * 60 * 1000) {
  if (!session?.created_at) return true;
  return Date.now() - new Date(session.created_at).getTime() > maxAgeMs;
}

/**
 * Check if a pipeline is currently active.
 */
export function isPipelineActive(session) {
  if (!session) return false;
  if (!session.phase) return false;
  if (!isSessionValid(session)) return false;
  const inactive = new Set([
    STATES.IDLE, STATES.DONE, STATES.ROLLED_BACK, STATES.FAILED,
  ]);
  return !inactive.has(session.phase);
}

/**
 * Get the artifact path expected for a given phase.
 */
export function artifactForPhase(phase, cwd = process.cwd()) {
  const findings = scopedFindingsDir(cwd);
  const map = {
    [STATES.PLANNING]: join(findings, "analysis.md"),
    [STATES.EXECUTING]: join(findings, "design.md"),
    [STATES.REVIEWING]: join(findings, "implementation.md"),
    [STATES.AWAITING_APPROVAL]: join(findings, "review.md"),
  };
  return map[phase] ?? null;
}

/**
 * Check if the required artifact exists for entering a given phase.
 */
export function hasRequiredArtifact(phase, cwd = process.cwd()) {
  const path = artifactForPhase(phase, cwd);
  if (!path) return true; // no artifact required
  return existsSync(path);
}
