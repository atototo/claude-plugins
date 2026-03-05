#!/usr/bin/env node
// post-task-ticket-sync.mjs — PostToolUse(TaskCreate/TaskUpdate) hook
// Mirrors Claude task operations into .party ticket files.
//
// fail-open: parsing/sync errors never block the tool call.

import { readFileSync } from "node:fs";
import { readSession, writeSession, isPipelineActive, isSessionValid, isSessionStale } from "../lib/session.mjs";
import { createTicket, updateTicket, listTickets } from "../lib/tickets.mjs";
import { STATES, TICKET_STATUSES } from "../lib/constants.mjs";

function toObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function extractTaskId(toolInput, toolResult) {
  const inObj = toObject(toolInput);
  const outObj = toObject(toolResult);
  const id = firstNonEmpty(
    outObj.id, outObj.task_id, outObj.taskId, outObj.task?.id,
    inObj.id, inObj.task_id, inObj.taskId, inObj.task?.id
  );
  return id || "";
}

function mapTaskStatus(raw) {
  const v = String(raw || "").toLowerCase();
  if (!v) return null;
  if (["done", "completed", "complete", "closed", "success"].includes(v)) return TICKET_STATUSES.DONE;
  if (["in_progress", "in-progress", "started", "active", "running", "doing"].includes(v)) return TICKET_STATUSES.IN_PROGRESS;
  if (["blocked", "waiting", "pending"].includes(v)) return TICKET_STATUSES.BLOCKED;
  if (["todo", "open", "queued", "new"].includes(v)) return TICKET_STATUSES.TODO;
  return null;
}

function effectiveTicketPhase(session) {
  if (session?.phase === STATES.PENDING_APPROVAL) {
    return String(session?.approval_context?.previous_phase || session.phase);
  }
  return String(session?.phase || "");
}

function hasBootstrapFields(toolInput, toolResult) {
  const title = firstNonEmpty(
    toolInput.title,
    toolInput.name,
    toolInput.summary,
    toolResult.title,
    toolResult.name
  );
  if (!title) return false;
  return !/^task\s+\d+$/i.test(title);
}

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = String(payload?.tool_name || "");
if (toolName !== "TaskCreate" && toolName !== "TaskUpdate" && toolName !== "SendMessage") {
  process.exit(0);
}

const session = readSession();
if (!session || !isPipelineActive(session) || !isSessionValid(session) || isSessionStale(session)) {
  process.exit(0);
}

const toolInput = toObject(payload?.tool_input);
const toolResult = toObject(payload?.tool_result);
const taskId = extractTaskId(toolInput, toolResult);

session.task_ticket_map = session.task_ticket_map || {};

const cwd = process.cwd();

try {
  if (toolName === "TaskCreate") {
    const title = firstNonEmpty(
      toolInput.title,
      toolInput.name,
      toolInput.summary,
      toolInput.prompt,
      toolResult.title,
      toolResult.name,
      // Fallback: try to extract meaningful title from description
      toolInput.description ? String(toolInput.description).split(".")[0].trim().slice(0, 80) : "",
      taskId ? `Task ${taskId}` : "Task"
    );
    const description = firstNonEmpty(toolInput.description, toolResult.description);
    const assignee = firstNonEmpty(toolInput.assignee, toolInput.owner, toolResult.assignee, null) || null;
    const phase = effectiveTicketPhase(session);
    const ticket = createTicket({
      sessionId: session.id,
      title,
      description,
      phase,
      assignee,
    });
    if (taskId) {
      session.task_ticket_map[String(taskId)] = ticket.id;
      writeSession(session);
    }
  }

  if (toolName === "TaskUpdate") {
    let mappedTicketId = taskId ? session.task_ticket_map[String(taskId)] : null;
    const directTicketId = firstNonEmpty(toolInput.ticket_id, toolInput.ticketId);
    // Some sessions emit TaskUpdate without prior TaskCreate — bootstrap a ticket.
    if (!mappedTicketId && taskId) {
      if (!hasBootstrapFields(toolInput, toolResult)) {
        process.exit(0);
      }
      const seeded = createTicket({
        sessionId: session.id,
        title: firstNonEmpty(
          toolInput.title,
          toolInput.name,
          toolInput.summary,
          toolResult.title,
          toolResult.name
        ),
        description: firstNonEmpty(toolInput.description, toolResult.description),
        phase: effectiveTicketPhase(session),
        assignee: firstNonEmpty(toolInput.assignee, toolResult.assignee, null) || null,
      });
      session.task_ticket_map[String(taskId)] = seeded.id;
      mappedTicketId = seeded.id;
      writeSession(session);
    }

    const ticketId = mappedTicketId || (/^(TICKET|PRT)-/i.test(directTicketId) ? directTicketId : null);
    if (!ticketId) process.exit(0);

    // Prefer observed result status over requested input status.
    const status = mapTaskStatus(firstNonEmpty(toolResult.status, toolResult.state, toolInput.status));
    const updates = {};
    if (status) updates.status = status;

    const findings = firstNonEmpty(toolInput.findings, toolResult.findings, toolResult.output_path);
    if (findings) updates.findings = findings;
    const report = firstNonEmpty(toolInput.report, toolResult.report, toolResult.summary);
    if (report) updates.report = report;

    if (Object.keys(updates).length > 0) {
      updateTicket(ticketId, updates, cwd);
    }
  }

  // SendMessage → mark assignee's TODO tickets as IN_PROGRESS
  if (toolName === "SendMessage") {
    const msgType = String(toolInput?.type || "message").toLowerCase();
    if (msgType !== "message") process.exit(0);
    const recipient = String(toolInput?.recipient || "").trim();
    if (!recipient || recipient === "leader" || recipient === "team-lead") process.exit(0);

    const currentPhase = effectiveTicketPhase(session);
    const toStart = listTickets({ assignee: recipient }, cwd)
      .filter((t) => t.type === "task" && t.status === TICKET_STATUSES.TODO
        && (!t.phase || t.phase === currentPhase));
    for (const t of toStart) {
      updateTicket(t.id, { status: TICKET_STATUSES.IN_PROGRESS }, cwd);
    }
  }
} catch {
  process.exit(0);
}

process.exit(0);
