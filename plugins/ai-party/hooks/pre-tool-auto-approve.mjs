#!/usr/bin/env node
// pre-tool-auto-approve.mjs — PreToolUse hook: 파이프라인 활성 시 LOW 위험군 자동 승인
//
// 목적: risk-based approval 정책에서 LOW 위험군만 훅 레벨 자동 승인
// MEDIUM/HIGH는 pre-tool-enforce(policy mode) 또는 기본 permission flow로 처리
//
// 실행 순서: pre-tool-enforce.mjs → (이 훅)
//   enforce가 session.json Write를 먼저 차단하므로 여기서는 미검사
//   enforce를 통과한 도구 호출만 이 훅에 도달
//
// 조건:
// - isPipelineActive(session) === true 일 때만 작동
// - 대상: classifyToolRisk()가 LOW로 분류한 도구만
// - 파이프라인 비활성이면 exit(0) → 일반 작업에 영향 없음
//
// fail-open: 오류 시 exit 0

import { readFileSync } from "node:fs";
import { readSession, isPipelineActive, isSessionValid, isSessionStale } from "../lib/session.mjs";
import { classifyToolRisk, isAutoApproveRisk, resolveApprovalMode } from "../lib/approval.mjs";

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = payload?.tool_name ?? "";

// 세션 확인
const session = readSession();

// 세션 유효성 검증 — invalid/stale이면 승인하지 않음
if (session && (!isSessionValid(session) || isSessionStale(session))) {
  process.exit(0);
}

// 파이프라인 비활성이면 일반 작업 — 승인하지 않음 (정상 permission flow)
if (!isPipelineActive(session)) {
  process.exit(0);
}

const riskLevel = classifyToolRisk(toolName, payload?.tool_input ?? {});
if (!isAutoApproveRisk(riskLevel)) {
  process.exit(0);
}

// LOW 위험군만 자동 승인
process.stdout.write(JSON.stringify({
  decision: "approve",
  permissionDecision: "allow",
  approval_mode: resolveApprovalMode(session),
  risk_level: riskLevel,
}));
process.exit(0);
