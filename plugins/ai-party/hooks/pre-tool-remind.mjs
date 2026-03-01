#!/usr/bin/env node
// pre-tool-remind.mjs — L1: PreToolUse(Task) context reminder
//
// Injects current pipeline status into systemMessage before Task calls.
// Helps the model stay aware of: unspawned members, current phase, pending tickets.
// This is a soft hint — L3 (enforce) and L2 (verify) are the hard gates.
//
// fail-open: errors → exit 0

import { readFileSync } from "node:fs";
import { readSession, isPipelineActive } from "../lib/session.mjs";
import { listTickets } from "../lib/tickets.mjs";
import { TICKET_STATUSES } from "../lib/constants.mjs";

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = payload?.tool_name ?? "";

// Only inject on Task tool calls (agent spawn/management)
if (toolName !== "Agent") {
  process.exit(0);
}

const cwd = process.cwd();
const session = readSession(cwd);

// No active pipeline → no reminder needed
if (!isPipelineActive(session)) {
  process.exit(0);
}

const parts = [];
parts.push(`[ai-party] Pipeline context — phase: ${session.phase}`);

// Unspawned members
if (session.members && Array.isArray(session.members)) {
  const unspawned = session.members.filter((m) => !m.spawned);
  if (unspawned.length > 0) {
    parts.push(
      `Unspawned members (${unspawned.length}): ${unspawned.map((m) => `${m.agent}(${m.role})`).join(", ")}`
    );
  }
}

// Ticket summary
const tickets = listTickets({}, cwd);
if (tickets.length > 0) {
  const byStatus = {};
  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }
  const summary = Object.entries(byStatus)
    .map(([s, c]) => `${s}:${c}`)
    .join(" | ");
  parts.push(`Tickets: ${summary} (total: ${tickets.length})`);

  // Show blocked tickets that are now ready
  const blocked = tickets.filter((t) => t.status === TICKET_STATUSES.BLOCKED);
  const nowReady = blocked.filter((t) =>
    t.dependsOn.every((depId) => {
      const dep = tickets.find((x) => x.id === depId);
      return dep && dep.status === TICKET_STATUSES.DONE;
    })
  );
  if (nowReady.length > 0) {
    parts.push(
      `Ready to unblock: ${nowReady.map((t) => t.id).join(", ")}`
    );
  }
}

if (parts.length > 1) {
  const result = {
    continue: true,
    systemMessage: parts.join("\n"),
  };
  process.stdout.write(JSON.stringify(result));
}

process.exit(0);
