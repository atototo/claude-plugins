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

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  ALLOWED_TOOLS,
  BLOCKED_TOOLS,
  HOST_DIRECT_STATES,
  SESSION_FILE,
} from "../lib/constants.mjs";
import { readSession, isPipelineActive, isSessionValid, isSessionStale } from "../lib/session.mjs";

function resolveRole(name) {
  const known = ["security-auditor", "researcher", "architect", "reviewer", "builder", "analyst", "deployer"];
  for (const role of known) {
    if (name === role || name.startsWith(`${role}-`)) return role;
  }
  return name;
}

function fallbackPhasesByRole(role) {
  if (role === "leader" || role === "orchestrator") return ["CONTEXTUALIZING"];
  if (role === "analyst" || role === "researcher" || role === "security-auditor") return ["ANALYZING"];
  if (role === "architect") return ["PLANNING"];
  if (role === "builder" || role === "deployer") return ["EXECUTING"];
  if (role === "reviewer") return ["REVIEWING"];
  return [];
}

function memberPhases(member) {
  const fromMember = Array.isArray(member?.phases)
    ? member.phases.map((v) => String(v).toUpperCase())
    : [];
  if (fromMember.length > 0) return fromMember;
  return fallbackPhasesByRole(member?.role || resolveRole(member?.name || member?.agent || ""));
}

function memberActiveInPhase(member, phase) {
  if (!phase) return false;
  const phases = memberPhases(member);
  return phases.includes(String(phase).toUpperCase());
}

function requiredInitialMembers(session) {
  const next = String(session?.starting_phase_after_context || "ANALYZING").toUpperCase();
  return (session?.members || []).filter((m) =>
    m.name === "leader" || m.agent === "leader" || m.agent === "leader-agent" || memberActiveInPhase(m, next)
  );
}

function parseTeamContract(session) {
  const teamName = session?.team;
  const pluginRoot = session?.pluginRoot;
  if (!teamName || !pluginRoot) return null;

  const teamPath = join(pluginRoot, "teams", `${teamName}.md`);
  if (!existsSync(teamPath)) return null;

  let content = "";
  try {
    content = readFileSync(teamPath, "utf-8");
  } catch {
    return null;
  }

  const membersMatch = content.match(/## Members\n([\s\S]*?)(?=\n## |$)/);
  if (!membersMatch) return null;

  const section = membersMatch[1];
  const memberPattern = /###\s+([^\n]+)\n([\s\S]*?)(?=\n###\s+|\n##\s+|$)/g;
  const byName = new Map();
  let m;

  while ((m = memberPattern.exec(section)) !== null) {
    const memberName = m[1].trim();
    const block = m[2];
    const phaseRaw = block.match(/- \*\*Phase\*\*:\s*([^\n]+)/i)?.[1] ?? "";
    const instruction = block.match(/- \*\*Instructions\*\*:\s*([^\n]+)/i)?.[1] ?? "";
    const outputPath = instruction.match(/`(\.party\/findings\/[^`]+)`/)?.[1] ?? "";

    byName.set(memberName, {
      name: memberName,
      role: resolveRole(memberName),
      phases: phaseRaw.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean),
      instruction,
      outputPath,
    });
  }

  return { byName };
}

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

// 1. 오케스트레이션 도구는 기본 허용 (단, SendMessage는 규약 검사를 위해 예외)
if (toolName !== "SendMessage" && ALLOWED_TOOLS.has(toolName)) {
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
  // 4a. initial required spawn 체크:
  // leader + starting_phase_after_context 멤버가 스폰될 때까지 허용 도구만 사용
  const initialRequired = requiredInitialMembers(session);
  const missingInitial = initialRequired.filter((m) => !m.spawned);
  if (missingInitial.length > 0) {
    const SPAWN_ALLOWED = new Set(["Agent", "TeamCreate", "AskUserQuestion", "Read", "Glob", "Grep"]);
    if (!SPAWN_ALLOWED.has(toolName)) {
      const result = {
        decision: "block",
        permissionDecision: "deny",
        message: `[ai-party] Initial lazy-spawn phase: only ${Array.from(SPAWN_ALLOWED).join(", ")} allowed until required members are spawned. Missing: ${missingInitial.map((m) => m.name).join(", ")}.`,
      };
      process.stdout.write(JSON.stringify(result));
      process.exit(2);
    }
  }

  // 4b. allSpawned 완료 후: leader delegation 규약 검사
  if (toolName === "SendMessage") {
    const type = payload?.tool_input?.type ?? "message";
    const recipient = payload?.tool_input?.recipient ?? "";
    const content = payload?.tool_input?.content ?? "";
    const phase = session.phase ?? "";
    const contract = parseTeamContract(session);
    const member = contract?.byName?.get(recipient);
    const runtimeMember = session.members?.find((m) => m.name === recipient);
    const isPipelinePhase = !HOST_DIRECT_STATES.has(phase);

    if (isPipelinePhase && type === "message" && recipient !== "leader") {
      if (runtimeMember && !runtimeMember.spawned) {
        const result = {
          decision: "block",
          permissionDecision: "deny",
          message: `[ai-party] SendMessage blocked: recipient "${recipient}" is not spawned yet. Spawn it with Agent(subagent_type='ai-party:${runtimeMember.agent}', name='${runtimeMember.name}') before messaging.`,
        };
        process.stdout.write(JSON.stringify(result));
        process.exit(2);
      }
    }

    if (isPipelinePhase && type === "message" && member && recipient !== "leader") {
      if (!member.phases.includes(phase)) {
        const result = {
          decision: "block",
          permissionDecision: "deny",
          message: `[ai-party] SendMessage blocked: recipient "${recipient}" is assigned to phase [${member.phases.join(", ")}], current phase is ${phase}.`,
        };
        process.stdout.write(JSON.stringify(result));
        process.exit(2);
      }
      if (member.outputPath && !content.includes(member.outputPath)) {
        const result = {
          decision: "block",
          permissionDecision: "deny",
          message: `[ai-party] SendMessage blocked: message to "${recipient}" must include contract output path "${member.outputPath}" from teams/${session.team}.md.`,
        };
        process.stdout.write(JSON.stringify(result));
        process.exit(2);
      }
    }
  }

  // 4c. allSpawned 완료 후: Leader architecture이므로 나머지는 enforcement skip
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
