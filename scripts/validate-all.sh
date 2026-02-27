#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGINS="$REPO_ROOT/plugins"
ERRORS=0

echo "=== Validating all plugins ==="
echo ""

if [[ ! -d "$PLUGINS" ]] || [[ -z "$(ls -A "$PLUGINS" 2>/dev/null)" ]]; then
  echo "No plugins found. Nothing to validate."
  exit 0
fi

for plugin_dir in "$PLUGINS"/*/; do
  [[ -d "$plugin_dir" ]] || continue
  plugin_name=$(basename "$plugin_dir")

  # plugin.json 존재 확인
  if [[ ! -f "$plugin_dir/.claude-plugin/plugin.json" ]]; then
    echo "❌ $plugin_name: missing .claude-plugin/plugin.json"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # JSON 유효성
  if ! jq empty "$plugin_dir/.claude-plugin/plugin.json" 2>/dev/null; then
    echo "❌ $plugin_name: invalid plugin.json (JSON parse error)"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # hooks.json 존재 시 검증
  if [[ -f "$plugin_dir/hooks/hooks.json" ]]; then
    if ! jq empty "$plugin_dir/hooks/hooks.json" 2>/dev/null; then
      echo "❌ $plugin_name: invalid hooks.json"
      ERRORS=$((ERRORS + 1))
      continue
    fi
  fi

  # 쉘 스크립트 문법 검사
  for sh_file in "$plugin_dir/scripts/"*.sh; do
    [[ -f "$sh_file" ]] || continue
    if ! bash -n "$sh_file" 2>/dev/null; then
      echo "❌ $plugin_name: syntax error in $(basename "$sh_file")"
      ERRORS=$((ERRORS + 1))
    fi
  done

  # Node.js 스크립트 검사
  for js_file in "$plugin_dir/hooks/"*.mjs "$plugin_dir/hooks/"*.js; do
    [[ -f "$js_file" ]] || continue
    if ! node --check "$js_file" 2>/dev/null; then
      echo "❌ $plugin_name: syntax error in $(basename "$js_file")"
      ERRORS=$((ERRORS + 1))
    fi
  done

  # claude plugin validate (CLI 설치 시)
  if command -v claude &>/dev/null; then
    if (cd "$plugin_dir" && claude plugin validate . 2>/dev/null); then
      echo "✅ $plugin_name"
    else
      echo "⚠️  $plugin_name: claude plugin validate failed"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "✅ $plugin_name (basic validation only — claude CLI not found)"
  fi
done

echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo "All plugins passed validation."
else
  echo "$ERRORS error(s) found."
  exit 1
fi
