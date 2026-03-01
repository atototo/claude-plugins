#!/usr/bin/env node
// post-pipeline-state.mjs — PostToolUse hook (empty matcher)
// 모든 도구 사용 후 발동하여, artifact 파일 존재 시 파이프라인 phase를 자동 전환한다.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { STATES, FINDINGS_DIR } from "../lib/constants.mjs";
import { readSession } from "../lib/session.mjs";
import { transition } from "../lib/state-machine.mjs";

const session = readSession();
if (!session) process.exit(0);

const cwd = process.cwd();

// ── Phase → artifact → 다음 phase 매핑 ──
const PHASE_ARTIFACTS = {
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
if (!phaseConfig) process.exit(0);

if (!existsSync(phaseConfig.artifact)) process.exit(0);

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
