#!/usr/bin/env node
// state-cli.mjs — CLI wrapper for state machine operations
// Usage:
//   node state-cli.mjs check-lock
//   node state-cli.mjs transition <STATE> <reason>
//   node state-cli.mjs status

import { checkSessionLock, transition, validTransitions } from "./state-machine.mjs";
import { readSession } from "./session.mjs";

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "check-lock": {
    const { locked, session } = checkSessionLock();
    if (locked) {
      console.error(
        `[ai-party] Pipeline lock active: phase=${session.phase}, id=${session.id}`
      );
      process.exit(1);
    }
    process.exit(0);
  }

  case "transition": {
    const [targetState, ...reasonParts] = args;
    if (!targetState) {
      console.error("Usage: state-cli.mjs transition <STATE> [reason]");
      process.exit(1);
    }
    const reason = reasonParts.join(" ") || "";
    const result = transition(targetState, reason);
    if (result.ok) {
      console.log(`[ai-party] Transitioned to ${targetState}`);
      process.exit(0);
    } else {
      console.error(`[ai-party] Transition failed: ${result.error}`);
      process.exit(1);
    }
  }

  case "status": {
    const session = readSession();
    if (!session) {
      console.log(JSON.stringify({ phase: "NONE", active: false }));
    } else {
      const vt = validTransitions();
      console.log(
        JSON.stringify({
          id: session.id,
          phase: session.phase,
          active: !["IDLE", "DONE", "ROLLED_BACK", "FAILED"].includes(session.phase),
          fix_loop: session.fix_loop,
          transitions: vt?.transitions ?? [],
        })
      );
    }
    process.exit(0);
  }

  default:
    console.error("Usage: state-cli.mjs <check-lock|transition|status>");
    process.exit(1);
}
