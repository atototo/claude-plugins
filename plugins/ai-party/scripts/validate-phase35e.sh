#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_ENFORCE="$ROOT/hooks/pre-tool-enforce.mjs"
HOOK_PIPELINE="$ROOT/hooks/post-pipeline-state.mjs"
TEAMS_DIR="$ROOT/teams"

NOW="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
PASS=0
FAIL=0

pass() { echo "[PASS] $1"; PASS=$((PASS+1)); }
fail() { echo "[FAIL] $1"; FAIL=$((FAIL+1)); }

run_hook() {
  local wd="$1"
  local payload="$2"
  set +e
  local out
  out="$(printf '%s' "$payload" | (cd "$wd" && node "$3") 2>&1)"
  local code=$?
  set -e
  echo "$code|$out"
}

mk_session_dir() {
  mktemp -d /tmp/ai-party-e-XXXX
}

# E-1: SendMessage includes exact instruction + output path
W1="$(mk_session_dir)"
mkdir -p "$W1/.party"
BUGFIX_INSTR="$(node -e 'const fs=require("fs");const p=process.argv[1];const c=fs.readFileSync(p,"utf8");const m=c.match(/### analyst\n([\s\S]*?)(?=\n###|\n##|$)/);if(!m){process.exit(1)};const line=(m[1].match(/- \*\*Instructions\*\*:\s*([^\n]+)/)||[])[1]||"";process.stdout.write(line);' "$TEAMS_DIR/bugfix.md")"
cat > "$W1/.party/session.json" <<JSON
{
  "id": "party-e1",
  "team": "bugfix",
  "phase": "ANALYZING",
  "created_at": "$NOW",
  "approval_mode": "cli",
  "pluginRoot": "$ROOT",
  "members": [
    {"name":"leader","agent":"leader","role":"orchestrator","spawned":true,"phases":["CONTEXTUALIZING"]},
    {"name":"analyst","agent":"analyst","role":"analyst","spawned":true,"phases":["ANALYZING"]}
  ]
}
JSON

P_OK="$(BUGFIX_INSTR="$BUGFIX_INSTR" node -e 'const p={tool_name:"SendMessage",tool_input:{type:"message",recipient:"analyst",content:`${process.env.BUGFIX_INSTR}\nOutput path: .party/findings/analysis.md`}};process.stdout.write(JSON.stringify(p));')"
R_OK="$(run_hook "$W1" "$P_OK" "$HOOK_ENFORCE")"
C_OK="${R_OK%%|*}"
if [[ "$C_OK" == "0" ]]; then
  pass "E-1a exact instruction+output path accepted"
else
  fail "E-1a expected allow, got: $R_OK"
fi

P_BAD_INSTR='{"tool_name":"SendMessage","tool_input":{"type":"message","recipient":"analyst","content":"요약해서 분석해줘. output=.party/findings/analysis.md"}}'
R_BAD_INSTR="$(run_hook "$W1" "$P_BAD_INSTR" "$HOOK_ENFORCE")"
C_BAD_INSTR="${R_BAD_INSTR%%|*}"
if [[ "$C_BAD_INSTR" == "2" ]] && [[ "$R_BAD_INSTR" == *"exact team contract instruction"* ]]; then
  pass "E-1b missing exact instruction blocked"
else
  fail "E-1b expected block for missing instruction, got: $R_BAD_INSTR"
fi

# E-2: research requires synthesis analysis.md after primary/secondary
W2="$(mk_session_dir)"
mkdir -p "$W2/.party/findings"
cat > "$W2/.party/session.json" <<JSON
{
  "id": "party-e2",
  "team": "research",
  "phase": "ANALYZING",
  "created_at": "$NOW",
  "approval_mode": "cli",
  "members": [
    {"name":"leader","agent":"leader","role":"orchestrator","spawned":true,"phases":["CONTEXTUALIZING"]},
    {"name":"researcher","agent":"researcher","role":"researcher","spawned":true,"phases":["ANALYZING"]},
    {"name":"researcher-2","agent":"researcher","role":"researcher","spawned":true,"phases":["ANALYZING"]},
    {"name":"architect","agent":"architect","role":"architect","spawned":true,"phases":["PLANNING"]}
  ],
  "phase_history": []
}
JSON
printf '%s\n' '# primary' > "$W2/.party/findings/research-primary.md"
printf '%s\n' '# secondary' > "$W2/.party/findings/research-secondary.md"

R_NO_SYNTH="$(run_hook "$W2" '{}' "$HOOK_PIPELINE")"
PHASE_NO_SYNTH="$(node -e 'const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(s.phase);' "$W2/.party/session.json")"
if [[ "$PHASE_NO_SYNTH" == "ANALYZING" ]]; then
  pass "E-2a without analysis.md, research stays ANALYZING"
else
  fail "E-2a expected ANALYZING, got $PHASE_NO_SYNTH ($R_NO_SYNTH)"
fi

printf '%s\n' '# synthesis analysis' > "$W2/.party/findings/analysis.md"
R_SYNTH="$(run_hook "$W2" '{}' "$HOOK_PIPELINE")"
PHASE_SYNTH="$(node -e 'const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(s.phase);' "$W2/.party/session.json")"
if [[ "$PHASE_SYNTH" == "PLANNING" ]]; then
  pass "E-2b with synthesis analysis.md, research transitions to PLANNING"
else
  fail "E-2b expected PLANNING, got $PHASE_SYNTH ($R_SYNTH)"
fi

# E-3: ANALYZING phase -> architect with review.md instruction blocked
W3="$(mk_session_dir)"
mkdir -p "$W3/.party"
cat > "$W3/.party/session.json" <<JSON
{
  "id": "party-e3",
  "team": "dev-backend",
  "phase": "ANALYZING",
  "created_at": "$NOW",
  "approval_mode": "cli",
  "pluginRoot": "$ROOT",
  "members": [
    {"name":"leader","agent":"leader","role":"orchestrator","spawned":true,"phases":["CONTEXTUALIZING"]},
    {"name":"architect","agent":"architect","role":"architect","spawned":true,"phases":["PLANNING"]}
  ]
}
JSON
P_E3='{"tool_name":"SendMessage","tool_input":{"type":"message","recipient":"architect","content":"결과를 .party/findings/review.md에 저장하라."}}'
R_E3="$(run_hook "$W3" "$P_E3" "$HOOK_ENFORCE")"
C_E3="${R_E3%%|*}"
if [[ "$C_E3" == "2" ]] && [[ "$R_E3" == *"assigned to phase"* ]]; then
  pass "E-3 architect review.md instruction blocked in ANALYZING"
else
  fail "E-3 expected phase mismatch block, got: $R_E3"
fi

# E-4: spawn phase Bash blocked, Read/Grep allowed for session recovery
W4="$(mk_session_dir)"
mkdir -p "$W4/.party"
cat > "$W4/.party/session.json" <<JSON
{
  "id": "party-e4",
  "team": "bugfix",
  "phase": "CONTEXTUALIZING",
  "created_at": "$NOW",
  "approval_mode": "cli",
  "starting_phase_after_context": "ANALYZING",
  "pluginRoot": "$ROOT",
  "members": [
    {"name":"leader","agent":"leader","role":"orchestrator","spawned":false,"phases":["CONTEXTUALIZING"]},
    {"name":"analyst","agent":"analyst","role":"analyst","spawned":false,"phases":["ANALYZING"]}
  ]
}
JSON

R_BASH="$(run_hook "$W4" '{"tool_name":"Bash","tool_input":{"command":"cat .party/session.json"}}' "$HOOK_ENFORCE")"
C_BASH="${R_BASH%%|*}"
if [[ "$C_BASH" == "2" ]] && [[ "$R_BASH" == *"Initial lazy-spawn phase"* ]]; then
  pass "E-4a spawn phase Bash blocked"
else
  fail "E-4a expected Bash block, got: $R_BASH"
fi

R_READ="$(run_hook "$W4" '{"tool_name":"Read","tool_input":{"file_path":".party/session.json"}}' "$HOOK_ENFORCE")"
C_READ="${R_READ%%|*}"
if [[ "$C_READ" == "0" ]]; then
  pass "E-4b spawn phase Read allowed"
else
  fail "E-4b expected Read allow, got: $R_READ"
fi

R_GREP="$(run_hook "$W4" '{"tool_name":"Grep","tool_input":{"pattern":"phase","path":".party/session.json"}}' "$HOOK_ENFORCE")"
C_GREP="${R_GREP%%|*}"
if [[ "$C_GREP" == "0" ]]; then
  pass "E-4c spawn phase Grep allowed"
else
  fail "E-4c expected Grep allow, got: $R_GREP"
fi

echo ""
echo "Phase 3.5-E summary: pass=$PASS fail=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
