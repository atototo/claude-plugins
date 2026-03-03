// approval-bridge.mjs — approval request queue + fingerprint helpers

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJSON } from "./atomic-write.mjs";
import { readActiveSessionId, scopedPathInSession } from "./session.mjs";

function normalizePathLike(value) {
  return String(value || "").replace(/\\/g, "/");
}

const VOLATILE_INPUT_KEYS = new Set([
  "description",
  "summary",
  "timestamp",
  "ts",
]);

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_INPUT_KEYS.has(key)) continue;
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

function approvalsDir(cwd = process.cwd(), sessionId = null) {
  const id = String(sessionId || readActiveSessionId(cwd) || "").trim();
  if (!id) return scopedPathInSession("unknown", "approvals", cwd);
  return scopedPathInSession(id, "approvals", cwd);
}

function requestPath(requestId, cwd = process.cwd(), sessionId = null) {
  return join(approvalsDir(cwd, sessionId), `${requestId}.json`);
}

function ensureApprovalsDir(cwd = process.cwd(), sessionId = null) {
  mkdirSync(approvalsDir(cwd, sessionId), { recursive: true });
}

function parseRequestFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function allSessionApprovalDirs(cwd = process.cwd()) {
  const roots = [approvalsDir(cwd)];

  const sessionsRoot = join(cwd, ".party", "sessions");
  if (existsSync(sessionsRoot)) {
    try {
      for (const ent of readdirSync(sessionsRoot, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        roots.push(join(sessionsRoot, ent.name, "approvals"));
      }
    } catch {
      // ignore
    }
  }

  return [...new Set(roots)];
}

export function readApprovalRequest(requestId, cwd = process.cwd()) {
  const candidates = [requestPath(requestId, cwd)];
  for (const dir of allSessionApprovalDirs(cwd)) {
    candidates.push(join(dir, `${requestId}.json`));
  }
  for (const filePath of candidates) {
    const req = parseRequestFile(filePath);
    if (req) return req;
  }
  return null;
}

export function listApprovalRequests(cwd = process.cwd(), sessionId = null) {
  const dir = approvalsDir(cwd, sessionId || readActiveSessionId(cwd));
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
  const requests = listApprovalRequests(cwd, sessionId);
  return requests.find(
    (r) =>
      r?.status === "pending" &&
      r?.fingerprint === fingerprint &&
      (!sessionId || r?.session_id === sessionId)
  ) || null;
}

export function getLatestPendingRequest(sessionId, cwd = process.cwd()) {
  const requests = listApprovalRequests(cwd, sessionId)
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
    ensureApprovalsDir(cwd, session?.id);
    atomicWriteJSON(requestPath(existing.request_id, cwd, session?.id), existing);
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
  ensureApprovalsDir(cwd, session?.id);
  atomicWriteJSON(requestPath(requestId, cwd, session?.id), req);
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
  ensureApprovalsDir(cwd, req.session_id);
  atomicWriteJSON(requestPath(requestId, cwd, req.session_id), req);
  return req;
}
