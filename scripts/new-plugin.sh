#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="${1:?Usage: new-plugin.sh <plugin-name>}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/$PLUGIN_NAME"

if [[ -d "$PLUGIN_DIR" ]]; then
  echo "Error: Plugin '$PLUGIN_NAME' already exists." >&2
  exit 1
fi

echo "Creating plugin: $PLUGIN_NAME"

mkdir -p "$PLUGIN_DIR"/{.claude-plugin,commands,skills/"$PLUGIN_NAME",hooks,scripts}

# plugin.json
cat > "$PLUGIN_DIR/.claude-plugin/plugin.json" <<EOF
{
  "name": "$PLUGIN_NAME",
  "version": "0.1.0",
  "description": "",
  "author": {
    "name": "young"
  },
  "hooks": "./hooks/hooks.json"
}
EOF

# hooks.json (빈 구조)
cat > "$PLUGIN_DIR/hooks/hooks.json" <<EOF
{
  "description": "$PLUGIN_NAME hooks",
  "hooks": {}
}
EOF

# SKILL.md 템플릿
cat > "$PLUGIN_DIR/skills/$PLUGIN_NAME/SKILL.md" <<EOF
---
name: $PLUGIN_NAME
description: ""
version: 0.1.0
---

# $PLUGIN_NAME Skill

## Purpose

## Use This Skill When

## Do Not Use This Skill When
EOF

# CLAUDE.md
cat > "$PLUGIN_DIR/CLAUDE.md" <<EOF
## $PLUGIN_NAME Policy

(플러그인 정책을 여기에 작성)
EOF

# README.md
cat > "$PLUGIN_DIR/README.md" <<EOF
# $PLUGIN_NAME

## 설치

\`\`\`bash
claude --plugin-dir plugins/$PLUGIN_NAME
\`\`\`

## 사용법

(사용법 작성)
EOF

# package.json
cat > "$PLUGIN_DIR/package.json" <<EOF
{
  "name": "@young-plugins/$PLUGIN_NAME",
  "version": "0.1.0",
  "private": true,
  "description": ""
}
EOF

# 공용 스크립트 복사
bash "$REPO_ROOT/scripts/build.sh"

echo ""
echo "✓ Plugin '$PLUGIN_NAME' created at: plugins/$PLUGIN_NAME"
echo ""
echo "Next steps:"
echo "  1. Edit .claude-plugin/plugin.json (description 추가)"
echo "  2. Add commands, skills, hooks as needed"
echo "  3. Run: cd plugins/$PLUGIN_NAME && claude plugin validate ."
