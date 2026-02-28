// events.mjs — structured event stream (.party/events.ndjson)
// Append-only NDJSON log for dashboard consumption and audit trail.

import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { EVENTS_FILE, PARTY_DIR } from "./constants.mjs";
import { readSession } from "./session.mjs";

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
  const filePath = join(cwd, EVENTS_FILE);

  // Ensure .party/ directory exists
  mkdirSync(join(cwd, PARTY_DIR), { recursive: true });

  let sessionId = opts.sessionId;
  if (!sessionId) {
    const session = readSession(cwd);
    sessionId = session?.id ?? "unknown";
  }

  const event = {
    ts: new Date().toISOString(),
    type,
    sessionId,
    data: data ?? {},
  };

  appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");
}
