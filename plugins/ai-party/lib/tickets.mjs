// tickets.mjs — ticket CRUD + dependency management
// Stores individual ticket files at .party/tickets/TICKET-NNN.json

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJSON } from "./atomic-write.mjs";
import { TICKETS_DIR, TICKET_STATUSES, EVENT_TYPES } from "./constants.mjs";
import { emit } from "./events.mjs";

/**
 * Get the next ticket number by scanning existing tickets.
 */
function nextTicketNumber(cwd) {
  const dir = join(cwd, TICKETS_DIR);
  if (!existsSync(dir)) return 1;
  const files = readdirSync(dir).filter((f) => f.startsWith("TICKET-") && f.endsWith(".json"));
  if (files.length === 0) return 1;
  const nums = files.map((f) => parseInt(f.replace("TICKET-", "").replace(".json", ""), 10));
  return Math.max(...nums) + 1;
}

/**
 * Create a new ticket.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.description
 * @param {string} opts.phase - Pipeline phase this ticket belongs to
 * @param {string} opts.assignee - Agent name (e.g., "gemini-analyst")
 * @param {string[]} [opts.dependsOn] - Ticket IDs this depends on
 * @param {string} [opts.cwd]
 * @returns {object} Created ticket
 */
export function createTicket({ title, description, phase, assignee, dependsOn = [], cwd = process.cwd() }) {
  const num = nextTicketNumber(cwd);
  const id = `TICKET-${String(num).padStart(3, "0")}`;

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
    title,
    description: description || "",
    phase,
    status,
    assignee: assignee || null,
    dependsOn,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    findings: null,
    report: null,
  };

  const filePath = join(cwd, TICKETS_DIR, `${id}.json`);
  atomicWriteJSON(filePath, ticket);

  emit(EVENT_TYPES.TICKET_CREATED, {
    ticketId: id,
    title,
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

  const filePath = join(cwd, TICKETS_DIR, `${ticketId}.json`);
  atomicWriteJSON(filePath, ticket);

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
  const filePath = join(cwd, TICKETS_DIR, `${ticketId}.json`);
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
  const dir = join(cwd, TICKETS_DIR);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => f.startsWith("TICKET-") && f.endsWith(".json"))
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
  const tickets = getPhaseTickets(phase, cwd);
  if (tickets.length === 0) return true; // no tickets = pass (backward compat)
  return tickets.every((t) => t.status === TICKET_STATUSES.DONE);
}
