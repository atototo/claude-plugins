// state-machine.mjs — pipeline state transition engine

import { STATES, MAX_FIX_ATTEMPTS } from "./constants.mjs";
import { readSession, writeSession, hasRequiredArtifact } from "./session.mjs";

// ── Transition table: { fromState: Set(allowedTargets) } ──
const TRANSITIONS = {
  [STATES.IDLE]: new Set([STATES.ANALYZING, STATES.PLANNING]),
  [STATES.ANALYZING]: new Set([STATES.PLANNING]),
  [STATES.PLANNING]: new Set([STATES.EXECUTING]),
  [STATES.EXECUTING]: new Set([STATES.REVIEWING]),
  [STATES.REVIEWING]: new Set([STATES.AWAITING_APPROVAL]),
  [STATES.AWAITING_APPROVAL]: new Set([
    STATES.APPROVED, STATES.REJECTED, STATES.REVISION,
  ]),
  [STATES.REVISION]: new Set([
    STATES.ANALYZING, STATES.PLANNING, STATES.EXECUTING,
  ]),
  [STATES.APPROVED]: new Set([STATES.DONE]),
  [STATES.REJECTED]: new Set([STATES.DONE, STATES.ROLLED_BACK]),
};

// ── Guard: phases that require an artifact from the previous step ──
const GUARDED_PHASES = new Set([
  STATES.PLANNING,
  STATES.EXECUTING,
  STATES.REVIEWING,
  STATES.AWAITING_APPROVAL,
]);

/**
 * Attempt a state transition.
 * @param {string} targetState - desired next state
 * @param {string} reason - human-readable reason for the transition
 * @param {object} [opts]
 * @param {string} [opts.cwd] - working directory (default: process.cwd())
 * @param {boolean} [opts.skipGuard] - skip artifact guard (e.g., IDLE→PLANNING direct)
 * @returns {{ ok: boolean, error?: string, session?: object }}
 */
export function transition(targetState, reason, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const session = readSession(cwd);

  if (!session) {
    return { ok: false, error: "No session.json found" };
  }

  const current = session.phase;

  // Validate transition exists
  const allowed = TRANSITIONS[current];
  if (!allowed || !allowed.has(targetState)) {
    return {
      ok: false,
      error: `Invalid transition: ${current} → ${targetState}`,
    };
  }

  // Guard: check required artifact (unless skipped or from IDLE)
  if (
    GUARDED_PHASES.has(targetState) &&
    !opts.skipGuard &&
    current !== STATES.IDLE
  ) {
    if (!hasRequiredArtifact(targetState, cwd)) {
      return {
        ok: false,
        error: `Guard failed: missing artifact for ${targetState}`,
      };
    }
  }

  // Fix loop: increment counter on REVISION entry
  if (targetState === STATES.REVISION) {
    session.fix_loop.attempt += 1;
    if (session.fix_loop.attempt > MAX_FIX_ATTEMPTS) {
      // Exceeded max retries → force FAILED
      session.phase = STATES.FAILED;
      session.phase_history.push({
        phase: STATES.FAILED,
        entered_at: new Date().toISOString(),
        reason: `Fix loop exceeded (${MAX_FIX_ATTEMPTS} attempts)`,
      });
      writeSession(session, cwd);
      return {
        ok: false,
        error: `Fix loop exceeded ${MAX_FIX_ATTEMPTS} attempts — moved to FAILED`,
        session,
      };
    }
  }

  // Apply transition
  session.phase = targetState;
  session.phase_history.push({
    phase: targetState,
    entered_at: new Date().toISOString(),
    reason: reason || "",
  });

  // Terminal states: mark done timestamp
  if ([STATES.DONE, STATES.ROLLED_BACK, STATES.FAILED].includes(targetState)) {
    session.completed_at = new Date().toISOString();
  }

  writeSession(session, cwd);
  return { ok: true, session };
}

/**
 * Check if a pipeline lock exists (active session).
 * @param {string} [cwd]
 * @returns {{ locked: boolean, session?: object }}
 */
export function checkSessionLock(cwd = process.cwd()) {
  const session = readSession(cwd);
  if (!session) return { locked: false };

  const terminal = new Set([
    STATES.IDLE, STATES.DONE, STATES.ROLLED_BACK, STATES.FAILED,
  ]);

  if (terminal.has(session.phase)) {
    return { locked: false, session };
  }

  return { locked: true, session };
}

/**
 * List valid transitions from current state.
 * @param {string} [cwd]
 * @returns {{ phase: string, transitions: string[] } | null}
 */
export function validTransitions(cwd = process.cwd()) {
  const session = readSession(cwd);
  if (!session) return null;

  const allowed = TRANSITIONS[session.phase];
  return {
    phase: session.phase,
    transitions: allowed ? [...allowed] : [],
  };
}
