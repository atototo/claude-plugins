#!/usr/bin/env bash
set -euo pipefail

# validate-phase3.sh — Phase 3 구현 검증
# Usage: bash scripts/validate-phase3.sh

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== ai-party Phase 3 Validation ==="
echo ""

# ── 1. Syntax check all .mjs files ──
echo "[1/5] Syntax check (.mjs files)"
for f in "$PLUGIN_DIR"/lib/*.mjs "$PLUGIN_DIR"/hooks/*.mjs; do
  if node --check "$f" 2>/dev/null; then
    ok "$(basename "$f")"
  else
    fail "$(basename "$f") — syntax error"
  fi
done
echo ""

# ── 2. Required files exist ──
echo "[2/5] Required files"
REQUIRED_FILES=(
  "lib/constants.mjs"
  "lib/atomic-write.mjs"
  "lib/session.mjs"
  "lib/state-machine.mjs"
  "lib/state-cli.mjs"
  "hooks/pre-tool-enforce.mjs"
  "hooks/pre-tool-model-inject.mjs"
  "hooks/post-pipeline-state.mjs"
)
for f in "${REQUIRED_FILES[@]}"; do
  if [[ -f "$PLUGIN_DIR/$f" ]]; then
    ok "$f exists"
  else
    fail "$f missing"
  fi
done
echo ""

# ── 3. hooks.json structure ──
echo "[3/5] hooks.json validation"
HOOKS_FILE="$PLUGIN_DIR/hooks/hooks.json"
if jq empty "$HOOKS_FILE" 2>/dev/null; then
  ok "hooks.json is valid JSON"
else
  fail "hooks.json is invalid JSON"
fi
# Check PreToolUse has 2 matchers
PRE_COUNT=$(jq '.hooks.PreToolUse | length' "$HOOKS_FILE" 2>/dev/null || echo 0)
if [[ "$PRE_COUNT" -eq 2 ]]; then
  ok "PreToolUse has 2 matchers"
else
  fail "PreToolUse expected 2 matchers, got $PRE_COUNT"
fi
# Check PostToolUse Task has 2 hooks
POST_HOOKS=$(jq '.hooks.PostToolUse[0].hooks | length' "$HOOKS_FILE" 2>/dev/null || echo 0)
if [[ "$POST_HOOKS" -eq 2 ]]; then
  ok "PostToolUse[Task] has 2 hooks"
else
  fail "PostToolUse[Task] expected 2 hooks, got $POST_HOOKS"
fi
echo ""

# ── 4. Version check ──
echo "[4/5] Version consistency"
PKG_VER=$(jq -r '.version' "$PLUGIN_DIR/package.json" 2>/dev/null)
PLUGIN_VER=$(jq -r '.version' "$PLUGIN_DIR/.claude-plugin/plugin.json" 2>/dev/null)
if [[ "$PKG_VER" == "0.7.0" ]]; then
  ok "package.json version=$PKG_VER"
else
  fail "package.json version=$PKG_VER (expected 0.7.0)"
fi
if [[ "$PLUGIN_VER" == "0.7.0" ]]; then
  ok "plugin.json version=$PLUGIN_VER"
else
  fail "plugin.json version=$PLUGIN_VER (expected 0.7.0)"
fi
echo ""

# ── 5. Hook smoke tests ──
echo "[5/5] Hook smoke tests"

# pre-tool-enforce: no .party/ → should exit 0 (allow)
TMPDIR_TEST=$(mktemp -d)
RESULT=$(cd "$TMPDIR_TEST" && echo '{"tool_name":"Read"}' | node "$PLUGIN_DIR/hooks/pre-tool-enforce.mjs" 2>/dev/null; echo "EXIT:$?")
if echo "$RESULT" | grep -q "EXIT:0"; then
  ok "pre-tool-enforce: no session → allow"
else
  fail "pre-tool-enforce: no session → expected exit 0"
fi

# pre-tool-model-inject: inject model for claude-agent
INJECT_OUT=$(echo '{"tool_name":"Task","tool_input":{"subagent_type":"ai-party:claude-agent"}}' | node "$PLUGIN_DIR/hooks/pre-tool-model-inject.mjs" 2>/dev/null)
if echo "$INJECT_OUT" | jq -e '.updatedInput.model == "opus"' >/dev/null 2>&1; then
  ok "pre-tool-model-inject: claude-agent → opus"
else
  fail "pre-tool-model-inject: expected model=opus"
fi

# pre-tool-model-inject: non-ai-party agent → no output
NON_AI=$(echo '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose"}}' | node "$PLUGIN_DIR/hooks/pre-tool-model-inject.mjs" 2>/dev/null; echo "EXIT:$?")
if echo "$NON_AI" | grep -q "EXIT:0"; then
  ok "pre-tool-model-inject: non-ai-party → pass-through"
else
  fail "pre-tool-model-inject: non-ai-party should exit 0"
fi

rm -rf "$TMPDIR_TEST"
echo ""

# ── Summary ──
echo "=== Results: $PASS passed, $FAIL failed ==="
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "All checks passed!"
