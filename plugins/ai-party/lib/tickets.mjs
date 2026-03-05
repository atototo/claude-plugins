// tickets.mjs — ticket CRUD + dependency management
// Ticket hierarchy (Jira-like):
//   Epic  : PRT-{short}              — one per session (auto-created on team init)
//   Story : PRT-{short}-{PHASE}      — one per pipeline phase (auto-created on phase start)
//   Task  : PRT-{short}-{PHASE}-NNN  — individual work items (created by leader via TaskCreate)
//
// {short} = first 6 hex chars of SHA1(sessionId) — collision-free, compact

import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJSON } from "./atomic-write.mjs";
import { TICKET_STATUSES, EVENT_TYPES } from "./constants.mjs";
import { emit } from "./events.mjs";
import { scopedTicketsDir } from "./session.mjs";

// ── ID helpers ──

function sessionShort(sessionId) {
  if (!sessionId) return "UNKNWN";
  return createHash("sha1").update(String(sessionId)).digest("hex").slice(0, 6).toUpperCase();
}

const PHASE_ABBREV = {
  CONTEXTUALIZING: "CTX",
  ANALYZING: "ANA",
  PLANNING: "PLN",
  EXECUTING: "EXE",
  REVIEWING: "REV",
};

function phaseAbbrev(phase) {
  return PHASE_ABBREV[String(phase || "").toUpperCase()] || String(phase || "UNK").slice(0, 3).toUpperCase();
}

export function epicId(sessionId) {
  return `PRT-${sessionShort(sessionId)}`;
}

export function storyId(sessionId, phase) {
  return `PRT-${sessionShort(sessionId)}-${phaseAbbrev(phase)}`;
}

function ticketPath(ticketId, cwd = process.cwd()) {
  const scoped = scopedTicketsDir(cwd);
  return join(scoped, `${ticketId}.json`);
}

function ensureTicketsDir(cwd) {
  mkdirSync(scopedTicketsDir(cwd), { recursive: true });
}

/**
 * Next task sequence number within a phase (e.g., PRT-A3F7B2-ANA-003 → 4).
 */
function nextTaskNumber(sessionId, phase, cwd) {
  const dir = scopedTicketsDir(cwd);
  if (!existsSync(dir)) return 1;
  const prefix = storyId(sessionId, phase) + "-";
  const nums = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((f) => parseInt(f.replace(prefix, "").replace(".json", ""), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

/**
 * Fallback: old TICKET-NNN scheme for sessions without sessionId context.
 */
function nextLegacyTicketNumber(cwd) {
  const dir = scopedTicketsDir(cwd);
  if (!existsSync(dir)) return 1;
  const files = readdirSync(dir).filter((f) => f.startsWith("TICKET-") && f.endsWith(".json"));
  if (files.length === 0) return 1;
  const nums = files.map((f) => parseInt(f.replace("TICKET-", "").replace(".json", ""), 10));
  return Math.max(...nums) + 1;
}

/**
 * Auto-create Epic ticket (one per session). Called by post-team-init hook.
 */
export function createEpicTicket({ sessionId, task, cwd = process.cwd() }) {
  const id = epicId(sessionId);
  ensureTicketsDir(cwd);
  // Idempotent: skip if already exists
  if (existsSync(ticketPath(id, cwd))) return getTicket(id, cwd);
  const ticket = {
    id,
    type: "epic",
    title: String(task || "AI Party pipeline").slice(0, 120),
    description: "",
    phase: null,
    status: TICKET_STATUSES.IN_PROGRESS,
    assignee: null,
    parentId: null,
    dependsOn: [],
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    findings: null,
    report: null,
  };
  atomicWriteJSON(ticketPath(id, cwd), ticket);
  emit(EVENT_TYPES.TICKET_CREATED, { ticketId: id, title: ticket.title, type: "epic" }, { cwd });
  return ticket;
}

/**
 * Auto-create Story ticket when a pipeline phase starts. Called by post-pipeline-state hook.
 */
export function createStoryTicket({ sessionId, phase, cwd = process.cwd() }) {
  const id = storyId(sessionId, phase);
  const parent = epicId(sessionId);
  ensureTicketsDir(cwd);
  // Idempotent: skip if already exists
  if (existsSync(ticketPath(id, cwd))) return getTicket(id, cwd);
  const PHASE_LABELS = {
    CONTEXTUALIZING: "Collect project context",
    ANALYZING: "Analyze codebase and requirements",
    PLANNING: "Design solution approach",
    EXECUTING: "Implement changes",
    REVIEWING: "Review and verify results",
  };
  const ticket = {
    id,
    type: "story",
    title: PHASE_LABELS[String(phase || "").toUpperCase()] || `${phase} phase`,
    description: "",
    phase: String(phase || "").toUpperCase(),
    status: TICKET_STATUSES.IN_PROGRESS,
    assignee: null,
    parentId: parent,
    dependsOn: [],
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    findings: null,
    report: null,
  };
  atomicWriteJSON(ticketPath(id, cwd), ticket);
  emit(EVENT_TYPES.TICKET_CREATED, { ticketId: id, title: ticket.title, type: "story", phase }, { cwd });
  return ticket;
}

/**
 * Mark all task tickets (and story) for a phase as DONE. Called before phase transition.
 */
export function completePhaseTickets(phase, cwd = process.cwd()) {
  const tickets = getPhaseTickets(phase, cwd);
  for (const t of tickets) {
    if (t.status !== TICKET_STATUSES.DONE) {
      updateTicket(t.id, { status: TICKET_STATUSES.DONE }, cwd);
    }
  }
}

/**
 * Create a new task ticket.
 * @param {object} opts
 * @param {string} opts.title         - Meaningful description of the work
 * @param {string} opts.description
 * @param {string} opts.phase         - Pipeline phase this ticket belongs to
 * @param {string} opts.assignee      - Agent name (e.g., "analyst", "builder-2")
 * @param {string} [opts.sessionId]   - Session ID for new-style PRT IDs
 * @param {string} [opts.parentId]    - Explicit parent Story ID (auto-derived if omitted)
 * @param {string[]} [opts.dependsOn] - Ticket IDs this depends on
 * @param {string} [opts.cwd]
 * @returns {object} Created ticket
 */
export function createTicket({ sessionId, title, description, phase, assignee, parentId, dependsOn = [], cwd = process.cwd() }) {
  ensureTicketsDir(cwd);

  // New-style ID: PRT-{short}-{PHASE}-NNN
  let id;
  let resolvedParentId = parentId || null;
  if (sessionId && phase) {
    const n = nextTaskNumber(sessionId, phase, cwd);
    id = `${storyId(sessionId, phase)}-${String(n).padStart(3, "0")}`;
    if (!resolvedParentId) resolvedParentId = storyId(sessionId, phase);
  } else {
    // Legacy fallback
    const num = nextLegacyTicketNumber(cwd);
    id = `TICKET-${String(num).padStart(3, "0")}`;
  }

  // If dependsOn has unresolved tickets, status is BLOCKED; otherwise TODO
  const hasDeps = dependsOn.length > 0;
  let status = TICKET_STATUSES.TODO;
  if (hasDeps) {
    const allDone = dependsOn.every((depId) => {
      const dep = getTicket(depId, cwd);
      return dep && dep.status === TICKET_STATUSES.DONE;
    });
    status = allDone ? TICKET_STATUSES.TODO : TICKET_STATUSES.BLOCKED;
  }

  const ticket = {
    id,
    type: "task",
    title: String(title || "Untitled task").slice(0, 120),
    description: description || "",
    phase: phase ? String(phase).toUpperCase() : null,
    status,
    assignee: assignee || null,
    parentId: resolvedParentId,
    dependsOn,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    findings: null,
    report: null,
  };

  atomicWriteJSON(ticketPath(id, cwd), ticket);

  emit(EVENT_TYPES.TICKET_CREATED, {
    ticketId: id,
    title: ticket.title,
    type: "task",
    phase,
    assignee,
    status,
    dependsOn,
  }, { cwd });

  return ticket;
}

/**
 * Update an existing ticket.
 * @param {string} ticketId
 * @param {object} updates - Fields to merge
 * @param {string} [cwd]
 * @returns {object|null} Updated ticket, or null if not found
 */
export function updateTicket(ticketId, updates, cwd = process.cwd()) {
  const ticket = getTicket(ticketId, cwd);
  if (!ticket) return null;

  const prevStatus = ticket.status;

  // Apply updates
  Object.assign(ticket, updates);

  // Auto-set timestamps on status transitions
  if (updates.status === TICKET_STATUSES.IN_PROGRESS && !ticket.startedAt) {
    ticket.startedAt = new Date().toISOString();
  }
  if (updates.status === TICKET_STATUSES.DONE && !ticket.completedAt) {
    ticket.completedAt = new Date().toISOString();
  }

  atomicWriteJSON(ticketPath(ticketId, cwd), ticket);

  // Emit update event
  emit(EVENT_TYPES.TICKET_UPDATED, {
    ticketId,
    prevStatus,
    status: ticket.status,
    phase: ticket.phase,
    assignee: ticket.assignee,
  }, { cwd });

  // When a ticket completes, unblock dependents
  if (updates.status === TICKET_STATUSES.DONE) {
    unblockDependents(ticketId, cwd);
  }

  return ticket;
}

/**
 * When a ticket is DONE, check all tickets that depend on it and
 * transition them from BLOCKED to TODO if all their deps are done.
 */
function unblockDependents(completedTicketId, cwd) {
  const all = listTickets({}, cwd);
  for (const t of all) {
    if (t.status !== TICKET_STATUSES.BLOCKED) continue;
    if (!t.dependsOn.includes(completedTicketId)) continue;

    // Check if ALL dependencies are now DONE
    const allDone = t.dependsOn.every((depId) => {
      const dep = getTicket(depId, cwd);
      return dep && dep.status === TICKET_STATUSES.DONE;
    });
    if (allDone) {
      updateTicket(t.id, { status: TICKET_STATUSES.TODO }, cwd);
    }
  }
}

/**
 * Get a single ticket by ID.
 * @param {string} ticketId
 * @param {string} [cwd]
 * @returns {object|null}
 */
export function getTicket(ticketId, cwd = process.cwd()) {
  const filePath = ticketPath(ticketId, cwd);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * List all tickets, optionally filtered.
 * @param {object} [filter]
 * @param {string} [filter.phase]
 * @param {string} [filter.status]
 * @param {string} [filter.assignee]
 * @param {string} [cwd]
 * @returns {object[]}
 */
export function listTickets(filter = {}, cwd = process.cwd()) {
  const dir = scopedTicketsDir(cwd);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => (f.startsWith("TICKET-") || f.startsWith("PRT-")) && f.endsWith(".json"))
    .sort();

  const tickets = [];
  for (const f of files) {
    try {
      const t = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      if (filter.phase && t.phase !== filter.phase) continue;
      if (filter.status && t.status !== filter.status) continue;
      if (filter.assignee && t.assignee !== filter.assignee) continue;
      tickets.push(t);
    } catch {
      // skip corrupt files
    }
  }
  return tickets;
}

/**
 * Check if a ticket is ready to start (all dependsOn are DONE).
 * @param {string} ticketId
 * @param {string} [cwd]
 * @returns {boolean}
 */
export function isTicketReady(ticketId, cwd = process.cwd()) {
  const ticket = getTicket(ticketId, cwd);
  if (!ticket) return false;
  if (ticket.dependsOn.length === 0) return true;
  return ticket.dependsOn.every((depId) => {
    const dep = getTicket(depId, cwd);
    return dep && dep.status === TICKET_STATUSES.DONE;
  });
}

/**
 * Get all tickets for a given phase.
 * @param {string} phase
 * @param {string} [cwd]
 * @returns {object[]}
 */
export function getPhaseTickets(phase, cwd = process.cwd()) {
  return listTickets({ phase }, cwd);
}

/**
 * Check if ALL tickets for a given phase are DONE.
 * Returns true if no tickets exist for the phase (backward compat).
 * @param {string} phase
 * @param {string} [cwd]
 * @returns {boolean}
 */
export function arePhaseTicketsDone(phase, cwd = process.cwd()) {
  // Only task tickets count — story tickets are IN_PROGRESS throughout the phase.
  const tickets = getPhaseTickets(phase, cwd).filter((t) => !t.type || t.type === "task");
  if (tickets.length === 0) return true; // no tickets = pass (backward compat)
  return tickets.every((t) => t.status === TICKET_STATUSES.DONE);
}
