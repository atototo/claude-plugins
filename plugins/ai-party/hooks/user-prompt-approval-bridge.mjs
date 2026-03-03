#!/usr/bin/env node
// user-prompt-approval-bridge.mjs — UserPromptSubmit hook
// Consume approve/reject/revise decisions for pending approval requests.

import { readFileSync } from "node:fs";
import { emit } from "../lib/events.mjs";
import { readSession, writeSession, isPipelineActive, isSessionValid, isSessionStale } from "../lib/session.mjs";
import { EVENT_TYPES, STATES } from "../lib/constants.mjs";
import { decideApprovalRequest, getLatestPendingRequest, readApprovalRequest } from "../lib/approval-bridge.mjs";

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const prompt = String(payload?.prompt || "").trim();
if (!prompt) process.exit(0);

const session = readSession();
if (!session || !isPipelineActive(session) || !isSessionValid(session) || isSessionStale(session)) {
  process.exit(0);
}

function approvalHelpText(req) {
  const requestId = String(req?.request_id || "").trim();
  if (!requestId) return "";
  const toolName = String(req?.tool_name || "tool");
  const risk = String(req?.risk_level || "");
  const sessionId = String(req?.session_id || "").trim();
  return [
    `[ai-party] Pending approval: ${requestId} (${toolName}${risk ? `/${risk}` : ""}) [session: ${sessionId || "unknown"}].`,
    sessionId
      ? `Enter exactly: approve ${sessionId} ${requestId}`
      : `Enter exactly: approve ${requestId}`,
    "(or: reject <request_id> <reason> | revise <request_id> <comment>)",
  ].join(" ");
}

function extractDecisionCommand(text) {
  const lines = String(text || "").split(/\r?\n/);
  // Prefer the latest explicit command line the user typed.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;
    const m = line.match(/^(?:[-*>`]+\s*)?(approve|ok|허가|승인(?:해|할게)?|reject|거절(?:해|할게)?|revise|수정(?:해|할게)?)(?:\s*:?\s*(.*))?$/i);
    if (!m) continue;
    const rest = String(m[2] || "").trim();
    const tokens = rest ? rest.split(/\s+/).filter(Boolean) : [];
    let requestIdArg = "";
    let sessionIdArg = "";
    const commentParts = [];
    for (const token of tokens) {
      if (!requestIdArg && /^APR-[A-Za-z0-9-]+$/i.test(token)) {
        requestIdArg = token;
        continue;
      }
      if (!sessionIdArg && /^party-[A-Za-z0-9-]+$/i.test(token)) {
        sessionIdArg = token;
        continue;
      }
      commentParts.push(token);
    }
    const comment = commentParts.join(" ").trim();
    return {
      verb: m[1].toLowerCase(),
      requestIdArg,
      sessionIdArg,
      comment,
    };
  }
  return null;
}

const command = extractDecisionCommand(prompt);
if (!command) {
  const pending = session.phase === STATES.PENDING_APPROVAL
    ? getLatestPendingRequest(session.id)
    : null;
  if (!pending || pending.status !== "pending") {
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: approvalHelpText(pending),
    },
  }));
  process.exit(0);
}

const { verb, requestIdArg, sessionIdArg, comment } = command;

let decision = null;
if (["approve", "ok", "허가", "승인", "승인해", "승인할게"].includes(verb)) decision = "approve";
if (["reject", "거절", "거절해", "거절할게"].includes(verb)) decision = "reject";
if (["revise", "수정", "수정해", "수정할게"].includes(verb)) decision = "revise";
if (!decision) process.exit(0);

const pending = requestIdArg
  ? readApprovalRequest(requestIdArg)
  : getLatestPendingRequest(session.id);

if (sessionIdArg && sessionIdArg !== session.id) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `[ai-party] Session mismatch. current=${session.id}, requested=${sessionIdArg}.`,
    },
  }));
  process.exit(0);
}

if (!pending || pending.status !== "pending") {
  process.exit(0);
}
if (String(pending.session_id || "") !== String(session.id || "")) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: [
        `[ai-party] Approval request ${pending.request_id} belongs to another session (${pending.session_id}).`,
        `[ai-party] Current session is ${session.id}.`,
      ].join(" "),
    },
  }));
  process.exit(0);
}

const decided = decideApprovalRequest(
  pending.request_id,
  decision,
  comment,
  "user",
);
if (!decided) process.exit(0);

const prevPhase = session?.approval_context?.previous_phase || decided.previous_phase || session.phase;
const wasPending = session.phase === STATES.PENDING_APPROVAL;

session.approval_context = null;
if (decision === "approve") {
  const grants = Array.isArray(session.approval_grants) ? session.approval_grants : [];
  grants.push({
    request_id: decided.request_id,
    fingerprint: decided.fingerprint,
    uses_left: 1,
    expires_at: new Date(Date.now() + (10 * 60 * 1000)).toISOString(),
  });
  session.approval_grants = grants;
}

if (wasPending && prevPhase) {
  session.phase_history = Array.isArray(session.phase_history) ? session.phase_history : [];
  session.phase_history.push({
    phase: prevPhase,
    entered_at: new Date().toISOString(),
    reason: `approval decision: ${decision} (${decided.request_id})`,
  });
  session.phase = prevPhase;
}

try {
  writeSession(session);
} catch {
  process.exit(0);
}

try {
  emit(EVENT_TYPES.DECISION_MADE, {
    request_id: decided.request_id,
    decision,
    comment,
    phase: prevPhase,
  });
  if (wasPending && prevPhase) {
    emit(EVENT_TYPES.PHASE_CHANGED, {
      from: STATES.PENDING_APPROVAL,
      to: prevPhase,
      reason: `approval decision: ${decision} (${decided.request_id})`,
    });
  }
} catch {
  // fail-open for event logging
}

const decisionMsg = decision === "approve"
  ? `[ai-party] Approval granted (${decided.request_id}). Resumed phase: ${prevPhase}. Retry the blocked action once to continue.`
  : decision === "reject"
    ? `[ai-party] Approval rejected (${decided.request_id}). Resumed phase: ${prevPhase}. Choose a LOW-risk alternative or revise plan.`
    : `[ai-party] Revision requested (${decided.request_id}). Resumed phase: ${prevPhase}. Update plan and retry with safer action.`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: decisionMsg,
  },
}));
process.exit(0);
