#!/usr/bin/env node
// pre-tool-auto-approve.mjs — PreToolUse hook: 파이프라인 활성 시 도구 자동 승인
//
// 목적: in-process agent의 Bash/Write 등 도구 호출 시 permission prompt 제거
// bypassPermissions 모드가 in-process agent에 무효하므로 훅 레벨에서 자동 승인
//
// 실행 순서: pre-tool-enforce.mjs → (이 훅)
//   enforce가 session.json Write를 먼저 차단하므로 여기서는 미검사
//   enforce를 통과한 도구 호출만 이 훅에 도달
//
// 조건:
// - isPipelineActive(session) === true 일 때만 작동
// - 대상: Bash, Write, Edit, MultiEdit, Read, Grep, Glob
// - 파이프라인 비활성이면 exit(0) → 일반 작업에 영향 없음
//
// fail-open: 오류 시 exit 0

import { readFileSync } from "node:fs";
import { readSession, isPipelineActive, isSessionValid, isSessionStale } from "../lib/session.mjs";

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = payload?.tool_name ?? "";

// 자동 승인 대상 도구
const AUTO_APPROVE_TOOLS = new Set([
  "Bash", "Write", "Edit", "MultiEdit", "Read", "Grep", "Glob",
]);

if (!AUTO_APPROVE_TOOLS.has(toolName)) {
  process.exit(0);
}

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

// 파이프라인 활성 → permission prompt 없이 자동 승인
process.stdout.write(JSON.stringify({ decision: "allow" }));
process.exit(0);
