#!/usr/bin/env node
// session-cli.mjs — CLI wrapper for session initialization
// Usage:
//   node session-cli.mjs init --team <team> --task "<task>" --members '[...]'
//   node session-cli.mjs status

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSession, writeSession, readSession } from "./session.mjs";
import { PARTY_DIR, FINDINGS_DIR, TICKETS_DIR } from "./constants.mjs";

const args = process.argv.slice(2);
const command = args[0];

function parseFlag(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

switch (command) {
  case "init": {
    const team = parseFlag("--team");
    const task = parseFlag("--task");
    const membersRaw = parseFlag("--members");

    if (!team || !task || !membersRaw) {
      console.error(
        'Usage: session-cli.mjs init --team <team> --task "<task>" --members \'[...]\''
      );
      process.exit(1);
    }

    let members;
    try {
      members = JSON.parse(membersRaw);
    } catch (e) {
      console.error(`[ai-party] Failed to parse --members JSON: ${e.message}`);
      process.exit(1);
    }

    if (!Array.isArray(members)) {
      console.error("[ai-party] --members must be a JSON array");
      process.exit(1);
    }

    const cwd = process.cwd();

    // Create directories deterministically
    mkdirSync(join(cwd, PARTY_DIR), { recursive: true });
    mkdirSync(join(cwd, FINDINGS_DIR), { recursive: true });
    mkdirSync(join(cwd, TICKETS_DIR), { recursive: true });

    // Create and write session
    const session = createSession({ team, task, members });
    writeSession(session, cwd);

    console.log(`[ai-party] Session initialized: ${session.id}`);
    console.log(
      `[ai-party] Directories: ${PARTY_DIR}/, ${FINDINGS_DIR}/, ${TICKETS_DIR}/`
    );
    console.log(`[ai-party] Members: ${members.length}`);
    process.exit(0);
  }

  case "status": {
    const session = readSession();
    if (!session) {
      console.log(JSON.stringify({ exists: false }));
    } else {
      console.log(
        JSON.stringify({
          exists: true,
          id: session.id,
          team: session.team,
          phase: session.phase,
          members_count: session.members.length,
          created_at: session.created_at,
        })
      );
    }
    process.exit(0);
  }

  default:
    console.error("Usage: session-cli.mjs <init|status>");
    process.exit(1);
}
