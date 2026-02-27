#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED="$REPO_ROOT/shared"
PLUGINS="$REPO_ROOT/plugins"

if [[ ! -d "$PLUGINS" ]] || [[ -z "$(ls -A "$PLUGINS" 2>/dev/null)" ]]; then
  echo "No plugins found. Skipping build."
  exit 0
fi

for plugin_dir in "$PLUGINS"/*/; do
  [[ -d "$plugin_dir" ]] || continue
  plugin_name=$(basename "$plugin_dir")
  echo "Building: $plugin_name"

  # shared/scripts → plugin/scripts (존재하는 파일만)
  if [[ -d "$SHARED/scripts" ]]; then
    mkdir -p "$plugin_dir/scripts"
    cp "$SHARED/scripts/"* "$plugin_dir/scripts/" 2>/dev/null || true
  fi

  # shared/hooks → plugin/hooks (존재하는 파일만, hooks.json 제외)
  if [[ -d "$SHARED/hooks" ]]; then
    mkdir -p "$plugin_dir/hooks"
    for f in "$SHARED/hooks/"*.mjs "$SHARED/hooks/"*.js; do
      [[ -f "$f" ]] && cp "$f" "$plugin_dir/hooks/"
    done
  fi

  echo "  ✓ $plugin_name"
done

echo "Build complete."
