#!/usr/bin/env node
// pre-tool-enforce.mjs — PreToolUse hook: 파이프라인 중 Host 직접 도구 차단
//
// 주의: Plugin hooks는 Host와 Teammate 세션 모두에서 실행된다.
// Leader architecture (leader-agent가 멤버에 있는 경우):
//   → Leader가 파이프라인을 관리하므로 enforcement 불필요 → skip
//   → Host는 auto-delegate + leader 위임으로 자연스럽게 직접 도구 사용 안 함
//   → Worker들은 도구 사용이 필수
// Non-leader architecture (향후 확장용):
//   → 기존 enforcement 로직 적용
//
// fail-open: 오류 시 항상 허용 (exit 0)

import { readFileSync } from "node:fs";
import {
  ALLOWED_TOOLS,
  BLOCKED_TOOLS,
  HOST_DIRECT_STATES,
} from "../lib/constants.mjs";
import { readSession, isPipelineActive } from "../lib/session.mjs";

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0); // fail-open
}

const toolName = payload?.tool_name ?? "";

// 1. 오케스트레이션 도구는 항상 허용
if (ALLOWED_TOOLS.has(toolName)) {
  process.exit(0);
}

// 2. 세션 읽기
const session = readSession();

// 3. 활성 파이프라인 없으면 허용
if (!isPipelineActive(session)) {
  process.exit(0);
}

// 4. Leader architecture: leader-agent가 멤버에 있으면 enforcement skip
// Leader가 파이프라인을 관리하고, Worker들은 도구 접근이 필수이므로
// 세션 전체에 대한 blanket deny는 적절하지 않다.
const hasLeader = session.members?.some(
  (m) => m.agent === "leader-agent" || m.role === "leader"
);
if (hasLeader) {
  process.exit(0);
}

// 5. Host가 직접 사용 가능한 상태면 허용
if (HOST_DIRECT_STATES.has(session.phase)) {
  process.exit(0);
}

// 6. 차단 대상이면 deny (non-leader 모드에서만 도달)
if (BLOCKED_TOOLS.has(toolName)) {
  const result = {
    permissionDecision: "deny",
    message: `[ai-party] Pipeline active (phase: ${session.phase}). Direct ${toolName} is blocked. Use Task tool to delegate to an agent.`,
  };
  process.stdout.write(JSON.stringify(result));
  process.exit(2);
}

// 7. 나머지는 fail-open
process.exit(0);
