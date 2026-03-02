// approval-bridge.mjs — approval request queue + fingerprint helpers

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJSON } from "./atomic-write.mjs";
import { APPROVALS_DIR } from "./constants.mjs";

function normalizePathLike(value) {
  return String(value || "").replace(/\\/g, "/");
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stableObject(value[key]);
    }
    return out;
  }
  if (typeof value === "string") return normalizePathLike(value);
  return value;
}

export function toolFingerprint(toolName, toolInput = {}) {
  const payload = JSON.stringify({
    tool_name: String(toolName || ""),
    tool_input: stableObject(toolInput || {}),
  });
  return createHash("sha1").update(payload).digest("hex");
}

function approvalsDir(cwd = process.cwd()) {
  return join(cwd, APPROVALS_DIR);
}

function requestPath(requestId, cwd = process.cwd()) {
  return join(approvalsDir(cwd), `${requestId}.json`);
}

function ensureApprovalsDir(cwd = process.cwd()) {
  mkdirSync(approvalsDir(cwd), { recursive: true });
}

export function readApprovalRequest(requestId, cwd = process.cwd()) {
  const filePath = requestPath(requestId, cwd);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export function listApprovalRequests(cwd = process.cwd()) {
  const dir = approvalsDir(cwd);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const out = [];
  for (const file of files) {
    try {
      out.push(JSON.parse(readFileSync(join(dir, file), "utf-8")));
    } catch {
      // ignore broken files
    }
  }
  return out;
}

export function getPendingRequestByFingerprint(fingerprint, sessionId, cwd = process.cwd()) {
  if (!fingerprint) return null;
  const requests = listApprovalRequests(cwd);
  return requests.find(
    (r) =>
      r?.status === "pending" &&
      r?.fingerprint === fingerprint &&
      (!sessionId || r?.session_id === sessionId)
  ) || null;
}

export function getLatestPendingRequest(sessionId, cwd = process.cwd()) {
  const requests = listApprovalRequests(cwd)
    .filter((r) => r?.status === "pending" && (!sessionId || r?.session_id === sessionId))
    .sort((a, b) => String(b?.requested_at || "").localeCompare(String(a?.requested_at || "")));
  return requests[0] || null;
}

export function upsertPendingRequest({
  session,
  toolName,
  toolInput = {},
  riskLevel,
  approvalMode,
  previousPhase,
  cooldownMs = 10_000,
  cwd = process.cwd(),
}) {
  const fingerprint = toolFingerprint(toolName, toolInput);
  const now = new Date().toISOString();
  const existing = getPendingRequestByFingerprint(fingerprint, session?.id, cwd);

  if (existing) {
    const last = new Date(existing.last_seen_at || existing.requested_at || 0).getTime();
    const coolDownActive = Number.isFinite(last) && (Date.now() - last) < cooldownMs;
    existing.last_seen_at = now;
    existing.retries = Number(existing.retries || 0) + 1;
    existing.cooldown_active = coolDownActive;
    ensureApprovalsDir(cwd);
    atomicWriteJSON(requestPath(existing.request_id, cwd), existing);
    return { request: existing, created: false, coolDownActive };
  }

  const requestId = `APR-${Date.now()}`;
  const req = {
    request_id: requestId,
    session_id: session?.id || "unknown",
    team: session?.team || null,
    phase: session?.phase || null,
    previous_phase: previousPhase || session?.phase || null,
    approval_mode: approvalMode || "platform",
    risk_level: riskLevel,
    tool_name: toolName,
    tool_input: toolInput,
    fingerprint,
    status: "pending",
    retries: 0,
    requested_at: now,
    last_seen_at: now,
    decision: null,
    decided_at: null,
    decision_comment: null,
  };
  ensureApprovalsDir(cwd);
  atomicWriteJSON(requestPath(requestId, cwd), req);
  return { request: req, created: true, coolDownActive: false };
}

export function decideApprovalRequest(requestId, decision, comment = "", decidedBy = "user", cwd = process.cwd()) {
  const req = readApprovalRequest(requestId, cwd);
  if (!req || req.status !== "pending") return null;
  req.status = "decided";
  req.decision = decision;
  req.decision_comment = String(comment || "");
  req.decided_by = decidedBy;
  req.decided_at = new Date().toISOString();
  ensureApprovalsDir(cwd);
  atomicWriteJSON(requestPath(requestId, cwd), req);
  return req;
}

