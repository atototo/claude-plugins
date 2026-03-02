#!/usr/bin/env node
// post-team-init.mjs — PostToolUse(TeamCreate) hook
// TeamCreate 완료 직후 .party/session.json을 결정론적으로 생성한다.
// LLM 프롬프트에 의존하지 않는 확실한 세션 초기화.
//
// fail-open: 오류 시 exit(0) — TeamCreate 자체를 막지 않는다.

import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, writeSession, readSession, isSessionValid, isSessionStale } from "../lib/session.mjs";
import { emit } from "../lib/events.mjs";
import {
  PARTY_DIR,
  FINDINGS_DIR,
  TICKETS_DIR,
  EVENT_TYPES,
  STATES,
  AGENT_MODEL_MAP,
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

// ── 멱등성: 같은 팀의 유효한(진행 중인) 세션만 재사용 ──
// 터미널 phase 세션은 재사용하지 않고 새로 생성한다.
const TERMINAL_PHASES = new Set([
  "COMPLETED", "DONE", "ROLLED_BACK", "FAILED", "REJECTED", "APPROVED",
  "AWAITING_APPROVAL",
]);

const cwd = process.cwd();
const existingSession = readSession(cwd);
if (existingSession && isSessionValid(existingSession) && !isSessionStale(existingSession)) {
  // teamName이 다르면 새 세션으로 덮어쓰기
  const existingTeamMatch = existingSession.id && existingSession.id.includes(teamName);
  if (existingTeamMatch && !TERMINAL_PHASES.has(existingSession.phase)) {
    // 같은 팀 + 진행 중 — pluginRoot/starting_phase 누락 시 패치
    let patched = false;
    if (!existingSession.pluginRoot) {
      existingSession.pluginRoot = join(__dirname, "..");
      patched = true;
    }
    if (!existingSession.starting_phase) {
      // 팀 타입에서 starting_phase 파싱 시도
      const tt = matchTeamType(teamName);
      if (tt) {
        const mdPath = join(TEAMS_DIR, `${tt}.md`);
        try {
          const content = readFileSync(mdPath, "utf-8");
          existingSession.starting_phase = parseStartingPhase(content);
          patched = true;
        } catch { /* ignore */ }
      }
    }
    if (patched) {
      try { writeSession(existingSession, cwd); } catch { /* ignore */ }
    }
    const msg = {
      continue: true,
      systemMessage: `[ai-party] Session already exists (${existingSession.id}, phase: ${existingSession.phase})${patched ? " — patched missing fields." : ". Skipping re-initialization."}`,
    };
    process.stdout.write(JSON.stringify(msg));
    process.exit(0);
  }
  // teamName이 다르면 → 아래로 진행하여 새 세션 생성
}

// ── 팀 타입 매칭 (파일 기반) ──
// Host LLM이 생성하는 팀 이름 형식이 예측 불가능하므로
// 실제 teams/*.md 파일명과 직접 매칭한다.
// "party-party-dev-frontend-20260228-20260228122636" → "dev-frontend"
// "party-bugfix-20260228105458" → "bugfix"
function matchTeamType(teamName) {
  let teamFiles;
  try {
    teamFiles = readdirSync(TEAMS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(".md", ""));
  } catch {
    return null;
  }
  // 긴 이름 우선 매칭 (dev-backend > dev)
  teamFiles.sort((a, b) => b.length - a.length);
  for (const tf of teamFiles) {
    if (teamName.includes(tf)) {
      return tf;
    }
  }
  return null;
}

// ── teams/*.md에서 멤버 파싱 ──
// v0.9.0 역할 기반: "### analyst" → { name: "analyst", agent: "analyst", role: "analyst" }
// v0.9.0 중복 역할: "### builder-2" → { name: "builder-2", agent: "builder", role: "builder" }
// v0.8.x 하위 호환: "### gemini-agent as analyst" → { name: "analyst", agent: "gemini-agent", role: "analyst" }
function parseMembersFromTeamMd(content) {
  // Members 섹션 추출
  const membersMatch = content.match(/## Members\n([\s\S]*?)(?=\n## |$)/);
  if (!membersMatch) return [];

  const membersSection = membersMatch[1];
  const members = [];
  const seen = new Set();

  // ### 헤딩 순회
  const headingPattern = /###\s+(.*)/g;
  let m;
  while ((m = headingPattern.exec(membersSection)) !== null) {
    const heading = m[1].trim();

    // 하위 호환: "gemini-agent as analyst"
    const legacyMatch = heading.match(/^([\w-]+)\s+as\s+([\w-]+)$/);
    if (legacyMatch) {
      const name = legacyMatch[2];
      if (!seen.has(name)) {
        members.push({ name, agent: legacyMatch[1], role: name });
        seen.add(name);
      }
      continue;
    }

    // v0.9.0 역할 기반: "analyst" 또는 "builder-2"
    const roleMatch = heading.match(/^([\w-]+)$/);
    if (roleMatch) {
      const name = roleMatch[1];
      const role = resolveRole(name);
      if (!seen.has(name)) {
        members.push({ name, agent: role, role });
        seen.add(name);
      }
    }
  }

  // leader는 항상 포함 (팀 MD에 없더라도)
  const hasLeader = members.some(
    (mem) => mem.agent === "leader-agent" || mem.agent === "leader" || mem.name === "leader"
  );
  if (!hasLeader) {
    members.unshift({
      name: "leader",
      agent: "leader",
      role: "orchestrator",
    });
  }
  return members;
}

// ── 역할명 해석: 중복 멤버의 이름에서 기본 역할을 추출 ──
// "builder-2" → "builder", "reviewer-security" → "reviewer"
// AGENT_MODEL_MAP 키와 매칭 (긴 이름 우선)
function resolveRole(name) {
  if (AGENT_MODEL_MAP[name]) return name;
  // 긴 역할명 우선: "security-auditor" > "auditor"
  const knownRoles = Object.keys(AGENT_MODEL_MAP).sort((a, b) => b.length - a.length);
  for (const role of knownRoles) {
    if (name.startsWith(`${role}-`)) return role;
  }
  return name;
}

// ── teams/*.md Workflow 섹션에서 시작 phase 파싱 ──
// "1. **ANALYZING**:" → "ANALYZING"
function parseStartingPhase(content) {
  const match = content.match(/\d+\.\s+\*\*(\w+)\*\*/);
  if (match && STATES[match[1]]) {
    return match[1];
  }
  return STATES.ANALYZING; // 기본값
}

// ── 팀 타입에서 멤버 목록 + 시작 phase 로드 ──
const teamType = matchTeamType(teamName);
let members = [];
let startingPhase = STATES.ANALYZING;

if (teamType) {
  const teamMdPath = join(TEAMS_DIR, `${teamType}.md`);
  if (existsSync(teamMdPath)) {
    try {
      const content = readFileSync(teamMdPath, "utf-8");
      members = parseMembersFromTeamMd(content);
      startingPhase = parseStartingPhase(content);
    } catch {
      // fail-soft: 팀 MD 파싱 실패 → 빈 멤버로 생성
    }
  }
}

// 멤버가 비어있으면 최소한 leader만
if (members.length === 0) {
  members = [{ name: "leader", agent: "leader", role: "orchestrator" }];
}

// ── 디렉토리 생성 + 이전 아티팩트 정리 ──
try {
  mkdirSync(join(cwd, PARTY_DIR), { recursive: true });
  mkdirSync(join(cwd, FINDINGS_DIR), { recursive: true });
  mkdirSync(join(cwd, TICKETS_DIR), { recursive: true });
  // BugC: 이전 세션 아티팩트 제거 → phantom transition 방지
  for (const dir of [FINDINGS_DIR, TICKETS_DIR]) {
    try {
      const files = readdirSync(join(cwd, dir));
      for (const f of files) {
        rmSync(join(cwd, dir, f), { force: true });
      }
    } catch { /* ignore */ }
  }
} catch {
  // fail-open: 디렉토리 생성 실패해도 계속
}

// ── 세션 생성 + 메타데이터 주입 ──
const task = description || "No description provided";
const session = createSession({ team: teamType || teamName, task, members });

// 훅 전용 메타데이터: LLM 프롬프트에 의존하지 않는 결정론적 값
session.pluginRoot = join(__dirname, ".."); // import.meta.url 기반 절대 경로
session.starting_phase = startingPhase;     // 팀 MD Workflow에서 파싱한 첫 phase

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
