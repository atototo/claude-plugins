#!/usr/bin/env bash
# gemini_exec.sh — Gemini CLI headless 래퍼 (ai-party edition)
# 정규화된 JSON을 stdout으로 출력한다.
#
# Gemini CLI headless 스펙:
#   gemini -p "<prompt>" --output-format json -y
#   파일 컨텍스트: cat file1 file2 | gemini -p "..." --output-format json -y
#   @ 참조:       gemini -p "@src/file.py 분석해줘" --output-format json -y
#   디렉토리:     --include-directories <dir>
#   JSON 출력:    { "response": "...", "stats": { "models": {...}, "tools": {...} } }
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

# ai-party 상태 디렉토리
export PLUGIN_STATE_DIR=".ai-party"

# ── 기본값 ──
TASK=""
WORKDIR="$(pwd)"
FILES=""
INCLUDE_DIRS=""
MODEL=""

# ── 인자 파싱 ──
while [ $# -gt 0 ]; do
  case "$1" in
    --task)    TASK="$2"; shift 2 ;;
    --workdir) WORKDIR="$2"; shift 2 ;;
    --files)
      shift
      while [ $# -gt 0 ]; do
        case "$1" in --*) break ;; esac
        if [ -n "$FILES" ]; then
          FILES="$FILES|$1"
        else
          FILES="$1"
        fi
        shift
      done
      ;;
    --include-directories)
      shift
      while [ $# -gt 0 ]; do
        case "$1" in --*) break ;; esac
        if [ -n "$INCLUDE_DIRS" ]; then
          INCLUDE_DIRS="$INCLUDE_DIRS|$1"
        else
          INCLUDE_DIRS="$1"
        fi
        shift
      done
      ;;
    --model) MODEL="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── 검증 ──
if [ -z "$TASK" ]; then
  echo "Error: --task is required" >&2
  exit 1
fi

if ! command -v gemini >/dev/null 2>&1; then
  emit_result false gemini 1 "gemini CLI not found. Install: npm i -g @anthropic-ai/gemini-cli or see https://github.com/google-gemini/gemini-cli"
  exit 1
fi

# ── 명령 조립 (배열 기반 — eval 미사용) ──
CMD=(gemini -y -p "$TASK" --output-format json)

if [ -n "$MODEL" ]; then
  CMD+=(--model "$MODEL")
fi

# --include-directories 추가
IFS='|'
for d in $INCLUDE_DIRS; do
  CMD+=(--include-directories "$d")
done
unset IFS

# ── 실행 ──
TMPFILE=$(mktemp)
ERRFILE=$(mktemp)
trap 'rm -f "$TMPFILE" "$ERRFILE"' EXIT

EXIT_CODE=0
cd "$WORKDIR"

if [ -n "$FILES" ]; then
  # --files가 있으면 stdin 파이프로 전달
  CAT_FILES=()
  IFS='|'
  for f in $FILES; do
    CAT_FILES+=("$f")
  done
  unset IFS
  cat "${CAT_FILES[@]}" | "${CMD[@]}" > "$TMPFILE" 2>"$ERRFILE" || EXIT_CODE=$?
else
  "${CMD[@]}" > "$TMPFILE" 2>"$ERRFILE" || EXIT_CODE=$?
fi

# ── JSON 출력 파싱 ──
# Gemini --output-format json 출력: { "response": "...", "stats": {...} }
RAW=$(cat "$TMPFILE")
RESPONSE=""
USAGE="null"

if [ -n "$RAW" ]; then
  # .response 추출
  RESPONSE=$(echo "$RAW" | jq -r '.response // empty' 2>/dev/null) || true

  # .stats → usage로 매핑
  USAGE=$(echo "$RAW" | jq '.stats // null' 2>/dev/null) || true
  [ -z "$USAGE" ] && USAGE="null"

  # response 추출 실패 시 raw 출력 사용
  if [ -z "$RESPONSE" ]; then
    RESPONSE="$RAW"
  fi
fi

# stdout이 비어있으면 stderr 사용
if [ -z "$RESPONSE" ] && [ -s "$ERRFILE" ]; then
  RESPONSE=$(cat "$ERRFILE")
fi

# ── 결과 판정 ──
OK=true
if [ $EXIT_CODE -ne 0 ]; then
  OK=false
fi

# ── 정규화된 JSON 출력 ──
cat <<EOF
{
  "ok": $OK,
  "source": "gemini",
  "exit_code": $EXIT_CODE,
  "thread_id": null,
  "response": $(echo "$RESPONSE" | jq -Rs .),
  "usage": $USAGE
}
EOF

# ── 상태 저장 ──
save_state "$WORKDIR" "gemini" "$(cat <<EOF2
{
  "source": "gemini_exec.sh",
  "thread_id": null,
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "exit_code": $EXIT_CODE,
  "usage": $USAGE,
  "response_preview": $(echo "$RESPONSE" | head -c 200 | jq -Rs .)
}
EOF2
)"
