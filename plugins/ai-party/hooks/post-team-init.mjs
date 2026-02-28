#!/usr/bin/env node
// post-team-init.mjs — PostToolUse(TeamCreate) hook
// TeamCreate 완료 직후 .party/session.json을 결정론적으로 생성한다.
// LLM 프롬프트에 의존하지 않는 확실한 세션 초기화.
//
// fail-open: 오류 시 exit(0) — TeamCreate 자체를 막지 않는다.

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, writeSession, readSession } from "../lib/session.mjs";
import { emit } from "../lib/events.mjs";
import {
  PARTY_DIR,
  FINDINGS_DIR,
  TICKETS_DIR,
  EVENT_TYPES,
} from "../lib/constants.mjs";

// ── 경로 해결: import.meta.url 기반 (OMC 패턴) ──
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEAMS_DIR = join(__dirname, "..", "teams");

// ── stdin에서 hook payload 읽기 ──
let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0); // fail-open
}

const toolName = payload?.tool_name ?? "";
const toolInput = payload?.tool_input ?? {};

// TeamCreate 이벤트만 처리
if (toolName !== "TeamCreate") {
  process.exit(0);
}

const teamName = toolInput.team_name ?? "";
const description = toolInput.description ?? "";

// ai-party 팀이 아니면 무시 (party- 접두사 필수)
if (!teamName.startsWith("party-")) {
  process.exit(0);
}

// ── 멱등성: 이미 session.json이 있으면 스킵 ──
const cwd = process.cwd();
const existingSession = readSession(cwd);
if (existingSession) {
  const msg = {
    continue: true,
    systemMessage: `[ai-party] Session already exists (${existingSession.id}, phase: ${existingSession.phase}). Skipping re-initialization.`,
  };
  process.stdout.write(JSON.stringify(msg));
  process.exit(0);
}

// ── 팀 타입 추출 ──
// "party-bugfix-20260228105458" → "bugfix"
// "party-dev-backend-20260228105458" → "dev-backend"
function extractTeamType(name) {
  const match = name.match(/^party-(.+?)-\d{14}$/);
  return match ? match[1] : null;
}

// ── teams/*.md에서 멤버 파싱 ──
// "### gemini-agent as analyst" → { name: "analyst", agent: "gemini-agent", role: "analyst" }
function parseMembersFromTeamMd(content) {
  const memberPattern = /###\s+([\w-]+)\s+as\s+([\w-]+)/g;
  const members = [];
  let m;
  while ((m = memberPattern.exec(content)) !== null) {
    members.push({ name: m[2], agent: m[1], role: m[2] });
  }
  // leader-agent는 항상 포함 (팀 MD에 없더라도)
  const hasLeader = members.some((mem) => mem.agent === "leader-agent");
  if (!hasLeader) {
    members.unshift({
      name: "leader",
      agent: "leader-agent",
      role: "orchestrator",
    });
  }
  return members;
}

// ── 팀 타입에서 멤버 목록 로드 ──
const teamType = extractTeamType(teamName);
let members = [];

if (teamType) {
  const teamMdPath = join(TEAMS_DIR, `${teamType}.md`);
  if (existsSync(teamMdPath)) {
    try {
      const content = readFileSync(teamMdPath, "utf-8");
      members = parseMembersFromTeamMd(content);
    } catch {
      // fail-soft: 팀 MD 파싱 실패 → 빈 멤버로 생성
    }
  }
}

// 멤버가 비어있으면 최소한 leader만
if (members.length === 0) {
  members = [{ name: "leader", agent: "leader-agent", role: "orchestrator" }];
}

// ── 디렉토리 생성 ──
try {
  mkdirSync(join(cwd, PARTY_DIR), { recursive: true });
  mkdirSync(join(cwd, FINDINGS_DIR), { recursive: true });
  mkdirSync(join(cwd, TICKETS_DIR), { recursive: true });
} catch {
  // fail-open: 디렉토리 생성 실패해도 계속
}

// ── 세션 생성 + 저장 ──
const task = description || "No description provided";
const session = createSession({ team: teamType || teamName, task, members });

try {
  writeSession(session, cwd);
} catch (e) {
  // session.json 쓰기 실패 → systemMessage로 경고만
  const msg = {
    continue: true,
    systemMessage: `[ai-party] WARNING: Failed to write session.json: ${e.message}. Pipeline may not work correctly.`,
  };
  process.stdout.write(JSON.stringify(msg));
  process.exit(0);
}

// ── 이벤트 기록 ──
try {
  emit(
    EVENT_TYPES.PIPELINE_STARTED,
    {
      sessionId: session.id,
      team: session.team,
      task: session.task,
      membersCount: members.length,
    },
    { cwd, sessionId: session.id }
  );
} catch {
  // 이벤트 기록 실패는 무시
}

// ── 성공 응답 ──
const msg = {
  continue: true,
  systemMessage: [
    `[ai-party] Session initialized: ${session.id}`,
    `Team: ${session.team} | Members: ${members.length} | Phase: ${session.phase}`,
    `Directories: ${PARTY_DIR}/, ${FINDINGS_DIR}/, ${TICKETS_DIR}/`,
    "",
    "session.json은 훅이 관리합니다. Write 도구로 직접 수정하지 마세요.",
    "다음 단계: Leader와 Worker 에이전트를 Task 도구로 스폰하세요.",
  ].join("\n"),
};

process.stdout.write(JSON.stringify(msg));
process.exit(0);
