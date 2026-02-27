#!/usr/bin/env bash
# 공용 쉘 유틸리티 — 빌드 시 각 플러그인의 scripts/로 복사됨
set -euo pipefail

# 정규화된 JSON 결과 출력
emit_result() {
  local ok="$1" source="$2" exit_code="$3" response="$4"
  local thread_id="${5:-null}" usage="${6:-null}"

  cat <<EOF
{
  "ok": $ok,
  "source": "$source",
  "exit_code": $exit_code,
  "thread_id": $thread_id,
  "response": $(echo "$response" | jq -Rs .),
  "usage": $usage
}
EOF
}

# 위임 상태 저장
# PLUGIN_STATE_DIR 환경변수로 상태 디렉토리명 변경 가능 (기본: .multi-delegate)
save_state() {
  local workdir="$1" source="$2" payload="$3"
  local state_dir="$workdir/${PLUGIN_STATE_DIR:-.multi-delegate}"
  mkdir -p "$state_dir"
  echo "$payload" > "$state_dir/last-${source}.json"
}
