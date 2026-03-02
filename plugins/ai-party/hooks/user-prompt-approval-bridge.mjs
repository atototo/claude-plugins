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

const m = prompt.match(/^\s*(approve|승인|reject|거절|revise|수정)\b(?:\s+([A-Za-z0-9-]+))?(?:\s+(.+))?\s*$/i);
if (!m) process.exit(0);

const verb = m[1].toLowerCase();
const requestIdArg = m[2] || "";
const comment = String(m[3] || "").trim();

let decision = null;
if (verb === "approve" || verb === "승인") decision = "approve";
if (verb === "reject" || verb === "거절") decision = "reject";
if (verb === "revise" || verb === "수정") decision = "revise";
if (!decision) process.exit(0);

const pending = requestIdArg
  ? readApprovalRequest(requestIdArg)
  : getLatestPendingRequest(session.id);

if (!pending || pending.status !== "pending") {
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
  ? `[ai-party] Approval granted (${decided.request_id}). Retry the blocked action once to continue.`
  : decision === "reject"
    ? `[ai-party] Approval rejected (${decided.request_id}). Choose a LOW-risk alternative or revise plan.`
    : `[ai-party] Revision requested (${decided.request_id}). Update plan and retry with safer action.`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: decisionMsg,
  },
}));
process.exit(0);

