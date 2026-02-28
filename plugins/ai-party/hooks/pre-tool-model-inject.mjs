#!/usr/bin/env node
// pre-tool-model-inject.mjs — PreToolUse(Task) hook
// ai-party 에이전트 스폰 시 model 파라미터를 자동 주입한다.
// 사용자가 이미 model을 지정한 경우 존중한다.

import { readFileSync } from "node:fs";
import { AGENT_MODEL_MAP } from "../lib/constants.mjs";

let payload;
try {
  const raw = readFileSync("/dev/stdin", "utf-8");
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = payload?.tool_name ?? "";
const toolInput = payload?.tool_input ?? {};

// Task 도구가 아니면 무시
if (toolName !== "Task") {
  process.exit(0);
}

const subagentType = toolInput?.subagent_type ?? "";

// ai-party: 프리픽스가 아니면 무시
if (!subagentType.startsWith("ai-party:")) {
  process.exit(0);
}

// 사용자가 이미 model을 지정했으면 존중
if (toolInput.model) {
  process.exit(0);
}

const agentKey = subagentType.replace("ai-party:", "");
const model = AGENT_MODEL_MAP[agentKey];

if (!model) {
  process.exit(0);
}

// model을 주입한 updatedInput 반환
const result = {
  updatedInput: { ...toolInput, model },
};

process.stdout.write(JSON.stringify(result));
process.exit(0);
