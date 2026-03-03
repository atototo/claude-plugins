// events.mjs — structured event stream (.party/events.ndjson)
// Append-only NDJSON log for dashboard consumption and audit trail.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { EVENTS_FILE, PARTY_DIR } from "./constants.mjs";
import { readSession, scopedPathInSession } from "./session.mjs";

/**
 * Emit a structured event to events.ndjson.
 * @param {string} type - One of EVENT_TYPES values
 * @param {object} data - Event-specific payload
 * @param {object} [opts]
 * @param {string} [opts.cwd] - working directory (default: process.cwd())
 * @param {string} [opts.sessionId] - override session ID (auto-read if omitted)
 */
export function emit(type, data, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();

  // Ensure .party/ directory exists
  mkdirSync(join(cwd, PARTY_DIR), { recursive: true });

  let sessionId = opts.sessionId;
  if (!sessionId) {
    const session = readSession(cwd);
    sessionId = session?.id ?? "unknown";
  }

  const scopedPath = sessionId && sessionId !== "unknown"
    ? scopedPathInSession(sessionId, "events.ndjson", cwd)
    : null;
  const event = {
    ts: new Date().toISOString(),
    type,
    sessionId,
    data: data ?? {},
  };

  const line = JSON.stringify(event) + "\n";
  if (scopedPath) {
    mkdirSync(scopedPathInSession(sessionId, ".", cwd), { recursive: true });
    appendFileSync(scopedPath, line, "utf-8");
  } else {
    const unknownPath = scopedPathInSession("unknown", EVENTS_FILE, cwd);
    mkdirSync(scopedPathInSession("unknown", ".", cwd), { recursive: true });
    appendFileSync(unknownPath, line, "utf-8");
  }
}
