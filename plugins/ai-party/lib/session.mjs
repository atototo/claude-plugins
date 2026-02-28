// session.mjs — .party/session.json read/write/status utilities

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJSON } from "./atomic-write.mjs";
import { SESSION_FILE, PARTY_DIR, FINDINGS_DIR, STATES } from "./constants.mjs";

/**
 * Read session.json from cwd. Returns null if not found.
 */
export function readSession(cwd = process.cwd()) {
  const path = join(cwd, SESSION_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write session.json atomically.
 */
export function writeSession(session, cwd = process.cwd()) {
  const path = join(cwd, SESSION_FILE);
  atomicWriteJSON(path, session);
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
    members,
    created_at: new Date().toISOString(),
  };
}

/**
 * Check if a pipeline is currently active.
 */
export function isPipelineActive(session) {
  if (!session) return false;
  const inactive = new Set([
    STATES.IDLE, STATES.DONE, STATES.ROLLED_BACK, STATES.FAILED,
  ]);
  return !inactive.has(session.phase);
}

/**
 * Get the artifact path expected for a given phase.
 */
export function artifactForPhase(phase, cwd = process.cwd()) {
  const map = {
    [STATES.PLANNING]: join(cwd, FINDINGS_DIR, "analysis.md"),
    [STATES.EXECUTING]: join(cwd, FINDINGS_DIR, "design.md"),
    [STATES.REVIEWING]: join(cwd, FINDINGS_DIR, "implementation.md"),
    [STATES.AWAITING_APPROVAL]: join(cwd, FINDINGS_DIR, "review.md"),
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
