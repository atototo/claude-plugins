#!/usr/bin/env node
// post-pipeline-state.mjs — PostToolUse hook (empty matcher)
// 모든 도구 사용 후 발동하여, artifact 파일 존재 시 파이프라인 phase를 자동 전환한다.
//
// 수정 이력 (v0.8.14):
// - B1: ANALYZING → analysis.md → PLANNING 추가
// - B5: 전환 전 세션 재로드로 중복 전환 방지
// - BugC: isPipelineActive + isSessionStale guard 추가

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { STATES } from "../lib/constants.mjs";
import { readSession, isPipelineActive, isSessionStale, scopedFindingsDir } from "../lib/session.mjs";
import { transition } from "../lib/state-machine.mjs";
import { arePhaseTicketsDone, completePhaseTickets, createStoryTicket } from "../lib/tickets.mjs";

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

function pendingMembersForPhase(activeSession, phase) {
  return (activeSession?.members || []).filter((m) =>
    !m.spawned && memberPhases(m).includes(String(phase).toUpperCase())
  );
}

const CORE_PHASE_ORDER = [
  STATES.ANALYZING,
  STATES.PLANNING,
  STATES.EXECUTING,
  STATES.REVIEWING,
];

function enabledWorkflowPhases(activeSession) {
  const enabled = new Set();
  for (const member of activeSession?.members || []) {
    for (const phase of memberPhases(member)) {
      if (CORE_PHASE_ORDER.includes(phase)) {
        enabled.add(phase);
      }
    }
  }

  // 팀 contract에서 phase를 읽지 못한 경우 시작 phase 기반으로 최소 복원
  if (enabled.size === 0) {
    enabled.add(String(activeSession?.starting_phase_after_context || STATES.ANALYZING).toUpperCase());
  }

  return enabled;
}

const session = readSession();

// Guard: 세션 없음 → 무시
if (!session) process.exit(0);

// Guard (BugC): 파이프라인 비활성 또는 stale → 무시
if (!isPipelineActive(session)) process.exit(0);
if (isSessionStale(session)) process.exit(0);

const cwd = process.cwd();
const scopedFindings = scopedFindingsDir(cwd);
mkdirSync(scopedFindings, { recursive: true });

function resolveFindingArtifact(fileName) {
  return join(scopedFindings, fileName);
}

function resolveContextArtifact() {
  return join(scopedFindings, "context.md");
}

const resolveNextAfterContext = (activeSession) => {
  if (activeSession?.starting_phase_after_context === STATES.PLANNING) {
    return STATES.PLANNING;
  }
  return STATES.ANALYZING;
};

function resolveNextPipelinePhase(activeSession, currentPhase) {
  const current = String(currentPhase || "").toUpperCase();
  if (current === STATES.CONTEXTUALIZING) {
    return resolveNextAfterContext(activeSession);
  }

  const enabled = enabledWorkflowPhases(activeSession);
  const currentIdx = CORE_PHASE_ORDER.indexOf(current);
  if (currentIdx < 0) {
    return STATES.AWAITING_APPROVAL;
  }

  for (let i = currentIdx + 1; i < CORE_PHASE_ORDER.length; i += 1) {
    const candidate = CORE_PHASE_ORDER[i];
    if (enabled.has(candidate)) {
      return candidate;
    }
  }
  return STATES.AWAITING_APPROVAL;
}

// ── Phase → artifact → 다음 phase 매핑 ──
// B1: ANALYZING 항목 추가
const PHASE_ARTIFACTS = {
  [STATES.CONTEXTUALIZING]: {
    artifact: resolveContextArtifact(),
    next: (activeSession) => resolveNextAfterContext(activeSession),
    label: "Contextualizing complete",
  },
  [STATES.ANALYZING]: {
    artifact: resolveFindingArtifact("analysis.md"),
    next: (activeSession) => resolveNextPipelinePhase(activeSession, STATES.ANALYZING),
    label: "Analysis complete",
  },
  [STATES.PLANNING]: {
    artifact: resolveFindingArtifact("design.md"),
    next: (activeSession) => resolveNextPipelinePhase(activeSession, STATES.PLANNING),
    label: "Planning complete",
  },
  [STATES.EXECUTING]: {
    artifact: resolveFindingArtifact("implementation.md"),
    next: (activeSession) => resolveNextPipelinePhase(activeSession, STATES.EXECUTING),
    label: "Execution complete",
  },
  [STATES.REVIEWING]: {
    artifact: resolveFindingArtifact("review.md"),
    next: (activeSession) => resolveNextPipelinePhase(activeSession, STATES.REVIEWING),
    label: "Review complete",
  },
};

const phaseConfig = PHASE_ARTIFACTS[session.phase];
if (!phaseConfig) process.exit(0);

if (!existsSync(phaseConfig.artifact)) process.exit(0);

// B5: 전환 전 세션 재로드 — 다른 훅이 이미 전환했을 수 있음
const freshSession = readSession();
if (!freshSession || freshSession.phase !== session.phase) {
  process.exit(0); // 이미 전환됨
}

// Multi-member phase guard: 현재 phase의 모든 티켓이 완료되어야 전환한다.
// (예: EXECUTING에서 builder + builder-2가 병렬 실행 시, 첫 번째 implementation.md 생성만으로 전환 방지)
// 티켓이 없으면 true 반환 (backward compat) — 티켓 미사용 팀은 영향 없음.
if (!arePhaseTicketsDone(session.phase, cwd)) {
  process.exit(0);
}

const nextPhase = typeof phaseConfig.next === "function"
  ? phaseConfig.next(freshSession)
  : phaseConfig.next;

// 현재 phase 티켓 전체 DONE 처리 (task + story)
try {
  completePhaseTickets(session.phase, cwd);
} catch {
  // fail-open
}

const result = transition(nextPhase, phaseConfig.label, { skipGuard: true });
if (result.ok) {
  const afterTransition = readSession();
  // 다음 phase Story 자동 생성
  try {
    if (afterTransition?.id) {
      createStoryTicket({ sessionId: afterTransition.id, phase: nextPhase, cwd });
    }
  } catch {
    // fail-open
  }
  const pendingNext = pendingMembersForPhase(afterTransition, nextPhase);
  const msg = {
    continue: true,
    systemMessage: [
      `[ai-party] State transition: ${session.phase} → ${nextPhase} (${phaseConfig.label}). Pipeline continues.`,
      pendingNext.length > 0
        ? `[ai-party] Lazy-spawn required for ${nextPhase}: ${pendingNext.map((m) => `${m.name}[ai-party:${m.agent}]`).join(", ")}`
        : "",
    ].filter(Boolean).join("\n"),
  };
  process.stdout.write(JSON.stringify(msg));
} else {
  const msg = {
    continue: true,
    systemMessage: `[ai-party] State transition failed: ${result.error}`,
  };
  process.stdout.write(JSON.stringify(msg));
}
process.exit(0);
