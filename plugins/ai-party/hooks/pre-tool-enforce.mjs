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
  SESSION_FILE,
} from "../lib/constants.mjs";
import { readSession, isPipelineActive, isSessionValid, isSessionStale } from "../lib/session.mjs";

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0); // fail-open
}

const toolName = payload?.tool_name ?? "";

// 0. session.json 직접 Write 차단 (훅이 관리하므로 파이프라인 상태 무관하게 항상 보호)
if (toolName === "Write") {
  const filePath = payload?.tool_input?.file_path ?? "";
  if (filePath.includes(".party/session.json") || filePath.endsWith(SESSION_FILE)) {
    const result = {
      decision: "block",
      permissionDecision: "deny",
      message: "[ai-party] .party/session.json is managed by hooks. Do not write directly. Use session-cli.mjs or the hook system.",
    };
    process.stdout.write(JSON.stringify(result));
    process.exit(2);
  }
}

// 1. 오케스트레이션 도구는 항상 허용
if (ALLOWED_TOOLS.has(toolName)) {
  process.exit(0);
}

// 2. 세션 읽기
const session = readSession();

// 2.5 세션 유효성/staleness 검증 — invalid/stale이면 enforcement skip
if (session && (!isSessionValid(session) || isSessionStale(session))) {
  process.exit(0);
}

// 3. 활성 파이프라인 없으면 허용
if (!isPipelineActive(session)) {
  process.exit(0);
}

// 4. Leader architecture: leader가 멤버에 있는 경우
//    v0.9.0: { agent: "leader", role: "orchestrator" }
//    v0.8.x: { agent: "leader-agent", role: "leader" }
const hasLeader = session.members?.some(
  (m) => m.agent === "leader-agent" || m.agent === "leader" || m.name === "leader"
);
if (hasLeader) {
  // 4a. allSpawned 체크: 전원 스폰 전까지는 Agent/TeamCreate만 허용
  const allSpawned = session.members.every((m) => m.spawned);
  if (!allSpawned) {
    const SPAWN_ALLOWED = new Set(["Agent", "TeamCreate", "AskUserQuestion", "Read", "Glob", "Grep"]);
    if (!SPAWN_ALLOWED.has(toolName)) {
      const unspawned = session.members.filter((m) => !m.spawned);
      const result = {
        decision: "block",
        permissionDecision: "deny",
        message: `[ai-party] Spawn phase: only Agent calls allowed until all members spawned. Unspawned: ${unspawned.map(m => m.agent).join(", ")}. Call Agent to spawn them now.`,
      };
      process.stdout.write(JSON.stringify(result));
      process.exit(2);
    }
  }
  // 4b. allSpawned 완료 후: Leader architecture이므로 enforcement skip
  process.exit(0);
}

// 5. Host가 직접 사용 가능한 상태면 허용
if (HOST_DIRECT_STATES.has(session.phase)) {
  process.exit(0);
}

// 6. 차단 대상이면 deny (non-leader 모드에서만 도달)
if (BLOCKED_TOOLS.has(toolName)) {
  const result = {
    decision: "block",
    permissionDecision: "deny",
    message: `[ai-party] Pipeline active (phase: ${session.phase}). Direct ${toolName} is blocked. Use Task tool to delegate to an agent.`,
  };
  process.stdout.write(JSON.stringify(result));
  process.exit(2);
}

// 7. 나머지는 fail-open
process.exit(0);
