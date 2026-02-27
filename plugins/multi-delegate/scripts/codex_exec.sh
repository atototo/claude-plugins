#!/usr/bin/env bash
# codex_exec.sh — Codex CLI 래퍼
# Codex exec를 실행하고 정규화된 JSON을 stdout으로 출력한다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

# ── 기본값 ──
TASK=""
WORKDIR="$(pwd)"
THREAD_ID=""
RESUME_LAST=false
MODEL=""
SANDBOX=""
FULL_AUTO=true
SKIP_GIT_CHECK=false

# ── 인자 파싱 ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)        TASK="$2"; shift 2 ;;
    --workdir)     WORKDIR="$2"; shift 2 ;;
    --thread-id)   THREAD_ID="$2"; shift 2 ;;
    --resume-last) RESUME_LAST=true; shift ;;
    --model)       MODEL="$2"; shift 2 ;;
    --sandbox)     SANDBOX="$2"; shift 2 ;;
    --no-full-auto) FULL_AUTO=false; shift ;;
    --skip-git-repo-check) SKIP_GIT_CHECK=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── 검증 ──
if [[ -z "$TASK" && "$RESUME_LAST" == "false" ]]; then
  echo "Error: --task is required" >&2
  exit 1
fi

if ! command -v codex &>/dev/null; then
  emit_result false codex 1 "codex CLI not found. Install: npm i -g @openai/codex"
  exit 1
fi

# ── resume-last: 마지막 상태에서 thread_id 복원 ──
if [[ "$RESUME_LAST" == "true" && -z "$THREAD_ID" ]]; then
  STATE_FILE="$WORKDIR/.multi-delegate/last-codex.json"
  if [[ -f "$STATE_FILE" ]]; then
    THREAD_ID=$(jq -r '.thread_id // empty' "$STATE_FILE" 2>/dev/null || true)
  fi
  if [[ -z "$THREAD_ID" ]]; then
    emit_result false codex 1 "No previous thread_id found for resume"
    exit 1
  fi
fi

# ── git repo 자동 감지 ──
# 사용자가 명시적으로 --skip-git-repo-check를 넘기지 않은 경우에만 자동 판단
if [[ "$SKIP_GIT_CHECK" == "false" ]]; then
  if ! git -C "$WORKDIR" rev-parse --is-inside-work-tree &>/dev/null; then
    SKIP_GIT_CHECK=true
  fi
fi

# ── 명령 조립 ──
CMD=(codex exec)

if [[ "$FULL_AUTO" == "true" ]]; then
  CMD+=(--full-auto)
fi

if [[ -n "$MODEL" ]]; then
  CMD+=(--model "$MODEL")
fi

if [[ -n "$SANDBOX" ]]; then
  CMD+=(--sandbox "$SANDBOX")
fi

if [[ "$SKIP_GIT_CHECK" == "true" ]]; then
  CMD+=(--skip-git-repo-check)
fi

if [[ -n "$THREAD_ID" ]]; then
  CMD+=(--thread "$THREAD_ID")
fi

CMD+=(--json "$TASK")

# ── 실행 ──
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

EXIT_CODE=0
cd "$WORKDIR"
"${CMD[@]}" > "$TMPFILE" 2>&1 || EXIT_CODE=$?

# ── JSONL 파싱 ──
# Codex는 JSONL 형식으로 출력한다.
# thread.started → thread_id, item.completed → response, turn.completed → usage
PARSED_THREAD_ID="null"
RESPONSE=""
USAGE="null"
ITEM_COUNT=0

while IFS= read -r line; do
  [[ -z "$line" ]] && continue

  event_type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null || true)

  case "$event_type" in
    "thread.started")
      PARSED_THREAD_ID=$(echo "$line" | jq -r '.thread.id // empty' 2>/dev/null || true)
      [[ -z "$PARSED_THREAD_ID" ]] && PARSED_THREAD_ID="null"
      ;;
    "item.completed")
      item_text=$(echo "$line" | jq -r '.item.content[]?.text // empty' 2>/dev/null || true)
      if [[ -n "$item_text" ]]; then
        RESPONSE="${RESPONSE}${item_text}"
        ITEM_COUNT=$((ITEM_COUNT + 1))
      fi
      ;;
    "turn.completed")
      USAGE=$(echo "$line" | jq '.usage // null' 2>/dev/null || echo "null")
      ;;
  esac
done < "$TMPFILE"

# 파싱 실패 시 raw output을 response로 사용
if [[ -z "$RESPONSE" ]]; then
  RESPONSE=$(cat "$TMPFILE")
fi

# ── thread_id 정규화 ──
if [[ "$PARSED_THREAD_ID" == "null" && -n "$THREAD_ID" ]]; then
  PARSED_THREAD_ID="$THREAD_ID"
fi

# ── 결과 판정 ──
OK=true
if [[ $EXIT_CODE -ne 0 ]]; then
  OK=false
fi

# ── JSON 출력 ──
THREAD_JSON="null"
if [[ "$PARSED_THREAD_ID" != "null" ]]; then
  THREAD_JSON="\"$PARSED_THREAD_ID\""
fi

cat <<EOF
{
  "ok": $OK,
  "source": "codex",
  "exit_code": $EXIT_CODE,
  "thread_id": $THREAD_JSON,
  "response": $(echo "$RESPONSE" | jq -Rs .),
  "usage": $USAGE,
  "item_count": $ITEM_COUNT
}
EOF

# ── 상태 저장 ──
save_state "$WORKDIR" "codex" "$(cat <<EOF2
{
  "source": "codex_exec.sh",
  "thread_id": $THREAD_JSON,
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "exit_code": $EXIT_CODE,
  "usage": $USAGE,
  "response_preview": $(echo "$RESPONSE" | head -c 200 | jq -Rs .)
}
EOF2
)"
