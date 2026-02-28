#!/usr/bin/env node
// post-pipeline-state.mjs — PostToolUse(Task) hook
// ai-party 팀 에이전트 완료 시 파이프라인 상태를 자동으로 다음 단계로 전환한다.
// 전환 조건: 해당 phase의 findings 파일이 존재할 때

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { STATES, FINDINGS_DIR } from "../lib/constants.mjs";
import { readSession } from "../lib/session.mjs";
import { transition } from "../lib/state-machine.mjs";
import { arePhaseTicketsDone } from "../lib/tickets.mjs";

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolInput = payload?.tool_input ?? {};
const subagentType = toolInput?.subagent_type ?? "";
const teamName = toolInput?.team_name ?? "";

// ai-party 에이전트 + 팀 모드일 때만 동작
if (!subagentType.startsWith("ai-party:") || !teamName) {
  process.exit(0);
}

const session = readSession();
if (!session) {
  process.exit(0);
}

const cwd = process.cwd();

// ── Phase → 생성 artifact → 다음 phase 매핑 ──
const PHASE_ARTIFACTS = {
  [STATES.ANALYZING]: {
    artifact: join(cwd, FINDINGS_DIR, "analysis.md"),
    next: STATES.PLANNING,
    label: "Analysis complete",
  },
  [STATES.PLANNING]: {
    artifact: join(cwd, FINDINGS_DIR, "design.md"),
    next: STATES.EXECUTING,
    label: "Planning complete",
  },
  [STATES.EXECUTING]: {
    artifact: join(cwd, FINDINGS_DIR, "implementation.md"),
    next: STATES.REVIEWING,
    label: "Execution complete",
  },
  [STATES.REVIEWING]: {
    artifact: join(cwd, FINDINGS_DIR, "review.md"),
    next: STATES.AWAITING_APPROVAL,
    label: "Review complete",
  },
};

const phaseConfig = PHASE_ARTIFACTS[session.phase];
if (!phaseConfig) {
  // 현재 phase가 자동 전환 대상이 아님
  process.exit(0);
}

// Check: artifact exists OR all phase tickets done
const artifactExists = existsSync(phaseConfig.artifact);
const ticketsDone = arePhaseTicketsDone(session.phase);

if (!artifactExists && !ticketsDone) {
  // Neither condition met → don't transition
  process.exit(0);
}

// 상태 전환 시도
const result = transition(phaseConfig.next, phaseConfig.label);

if (result.ok) {
  const msg = {
    continue: true,
    systemMessage: `[ai-party] State transition: ${session.phase} → ${phaseConfig.next} (${phaseConfig.label}). Pipeline continues.`,
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
