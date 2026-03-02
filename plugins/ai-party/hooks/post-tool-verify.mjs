#!/usr/bin/env node
// post-tool-verify.mjs — L2: PostToolUse verification hook
//
// Responsibilities:
// 1. Team spawn verification: track Agent(Task) calls → mark members as spawned
//    → lazy-spawn progress messages by current phase, emit team_spawn_verified when all eventually spawned
// 2. Ticket completion check: after agent completes, check if phase tickets are done
//
// Trigger: PostToolUse(Task) — runs after agent spawn/completion
// fail-open: errors → exit 0

import { readFileSync } from "node:fs";
import { readSession, writeSession } from "../lib/session.mjs";
import { transition } from "../lib/state-machine.mjs";
import { arePhaseTicketsDone } from "../lib/tickets.mjs";
import { emit } from "../lib/events.mjs";
import { EVENT_TYPES, STATES } from "../lib/constants.mjs";

function fallbackPhasesByRole(role) {
  if (role === "leader" || role === "orchestrator") return [STATES.CONTEXTUALIZING];
  if (role === "analyst" || role === "researcher" || role === "security-auditor") return [STATES.ANALYZING];
  if (role === "architect") return [STATES.PLANNING];
  if (role === "builder" || role === "deployer") return [STATES.EXECUTING];
  if (role === "reviewer") return [STATES.REVIEWING];
  return [];
}

function memberPhases(member) {
  const fromMember = Array.isArray(member?.phases)
    ? member.phases.map((v) => String(v).toUpperCase())
    : [];
  if (fromMember.length > 0) return fromMember;
  return fallbackPhasesByRole(member?.role || member?.agent || "");
}

function membersForPhase(session, phase) {
  return (session?.members || []).filter((m) => memberPhases(m).includes(String(phase).toUpperCase()));
}

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = payload?.tool_name ?? "";
const toolInput = payload?.tool_input ?? {};
const subagentType = toolInput?.subagent_type ?? "";
const teamName = toolInput?.team_name ?? "";
const agentName = toolInput?.name ?? "";

// Only handle ai-party agents in team mode
if (!subagentType.startsWith("ai-party:") || !teamName) {
  process.exit(0);
}

const cwd = process.cwd();
const session = readSession(cwd);
if (!session) {
  process.exit(0);
}

const messages = [];

// ── 1. Spawn tracking ──
// When a Task call spawns an ai-party agent, mark it as spawned in session.json
const agentType = subagentType.replace("ai-party:", "");

if (session.members && Array.isArray(session.members)) {
  const member = session.members.find(
    (m) => (m.agent === agentType || m.name === agentName) && !m.spawned
  );

  if (member) {
    member.spawned = true;
    writeSession(session, cwd);

    emit(EVENT_TYPES.AGENT_SPAWNED, {
      agent: agentType,
      name: agentName || member.name,
      role: member.role,
    }, { cwd, sessionId: session.id });

    const unspawned = session.members.filter((m) => !m.spawned);
    const activePhaseMembers = membersForPhase(session, session.phase);
    const pendingInPhase = activePhaseMembers.filter((m) => !m.spawned);
    const nextPhaseMembers = membersForPhase(session, session.starting_phase_after_context || STATES.ANALYZING)
      .filter((m) => !m.spawned);

    if (unspawned.length === 0) {
      emit(EVENT_TYPES.TEAM_SPAWN_VERIFIED, {
        team: session.team,
        memberCount: session.members.length,
      }, { cwd, sessionId: session.id });
      messages.push(`[ai-party] Team spawn verified: all ${session.members.length} members spawned.`);
    } else if (pendingInPhase.length > 0) {
      messages.push(
        `[ai-party] Spawned: ${agentType}. Pending in current phase (${session.phase}): ${pendingInPhase.map((m) => m.name).join(", ")}`
      );
    } else if (session.phase === STATES.CONTEXTUALIZING && nextPhaseMembers.length > 0) {
      messages.push(
        `[ai-party] Spawned: ${agentType}. Context phase ready. Pre-spawn recommended for next phase (${session.starting_phase_after_context}): ${nextPhaseMembers.map((m) => m.name).join(", ")}`
      );
    } else {
      messages.push(
        `[ai-party] Spawned: ${agentType}. Remaining optional/later-phase members: ${unspawned.map((m) => m.name).join(", ")}`
      );
    }

    // Legacy safety: keep IDLE auto-start path for backward compatibility.
    if (session.phase === STATES.IDLE) {
      const targetPhase = session.starting_phase || STATES.ANALYZING;
      const transResult = transition(targetPhase, "Required members spawned — auto-starting pipeline", { cwd });
      if (transResult.ok) {
        messages.push(`[ai-party] Pipeline auto-started: IDLE → ${targetPhase}`);
      } else {
        messages.push(`[ai-party] Auto-start failed: ${transResult.error}`);
      }
    }
  }
}

// ── 2. Agent completion → emit event ──
// If this is a completed agent (tool_result exists), emit agent_completed
const toolResult = payload?.tool_result;
if (toolResult !== undefined) {
  emit(EVENT_TYPES.AGENT_COMPLETED, {
    agent: agentType,
    name: agentName,
    phase: session.phase,
  }, { cwd, sessionId: session.id });
}

// ── 3. Ticket completion check ──
// After agent completes, check if current phase's tickets are all done
if (toolResult !== undefined && session.phase) {
  const phaseDone = arePhaseTicketsDone(session.phase, cwd);
  if (phaseDone) {
    messages.push(
      `[ai-party] All tickets for phase ${session.phase} are DONE. Phase transition ready.`
    );
  }
}

// ── Output ──
if (messages.length > 0) {
  const result = {
    continue: true,
    systemMessage: messages.join("\n"),
  };
  process.stdout.write(JSON.stringify(result));
}

process.exit(0);
