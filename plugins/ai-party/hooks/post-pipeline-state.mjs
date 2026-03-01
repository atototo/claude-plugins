#!/usr/bin/env node
// post-pipeline-state.mjs — PostToolUse hook (empty matcher)
// 모든 도구 사용 후 발동하여, artifact 파일 존재 시 파이프라인 phase를 자동 전환한다.
//
// 수정 이력 (v0.8.14):
// - B1: ANALYZING → analysis.md → PLANNING 추가
// - B5: 전환 전 세션 재로드로 중복 전환 방지
// - BugC: isPipelineActive + isSessionStale guard 추가

import { existsSync } from "node:fs";
import { join } from "node:path";
import { STATES, FINDINGS_DIR } from "../lib/constants.mjs";
import { readSession, isPipelineActive, isSessionStale } from "../lib/session.mjs";
import { transition } from "../lib/state-machine.mjs";

const session = readSession();

// Guard: 세션 없음 → 무시
if (!session) process.exit(0);

// Guard (BugC): 파이프라인 비활성 또는 stale → 무시
if (!isPipelineActive(session)) process.exit(0);
if (isSessionStale(session)) process.exit(0);

const cwd = process.cwd();

// ── Phase → artifact → 다음 phase 매핑 ──
// B1: ANALYZING 항목 추가
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
if (!phaseConfig) process.exit(0);

if (!existsSync(phaseConfig.artifact)) process.exit(0);

// B5: 전환 전 세션 재로드 — 다른 훅이 이미 전환했을 수 있음
const freshSession = readSession();
if (!freshSession || freshSession.phase !== session.phase) {
  process.exit(0); // 이미 전환됨
}

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
