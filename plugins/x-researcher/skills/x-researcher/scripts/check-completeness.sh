#!/bin/bash
# Hook: Stop
# 목적: 리서치 완료 시 수집 로그 vs 토픽 반영 갭 체크, 필수 파일 생성 여부 확인

INPUT=$(cat)

# Stop 훅은 tool_input이 없으므로 설정에서 vault 경로를 읽는다
CONFIG_FILE="$HOME/.claude/x-researcher-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  exit 0
fi

VAULT_PATH=$(python3 -c "
import json, os
with open(os.path.expanduser('$CONFIG_FILE')) as f:
    cfg = json.load(f)
vault = os.path.expanduser(cfg.get('obsidian_vault_path', ''))
folder = cfg.get('research_folder', '')
print(os.path.join(vault, folder))
" 2>/dev/null)

if [ -z "$VAULT_PATH" ] || [ ! -d "$VAULT_PATH" ]; then
  exit 0
fi

TODAY=$(date +%Y-%m-%d)
WARNINGS=""

# 1. 오늘 runs 파일이 있는지 확인
RUNS_COUNT=$(ls "$VAULT_PATH/runs/$TODAY"*.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$RUNS_COUNT" -eq 0 ]; then
  WARNINGS="${WARNINGS}\n  - ❌ 오늘 runs/ 파일이 없음 → 수집 로그 미작성"
fi

# 2. 오늘 daily 파일이 있는지 확인
if [ ! -f "$VAULT_PATH/daily/$TODAY.md" ]; then
  WARNINGS="${WARNINGS}\n  - ❌ 오늘 daily/ 파일이 없음 → 일일 요약 미작성"
fi

# 3. _index.md 존재 확인
if [ ! -f "$VAULT_PATH/_index.md" ]; then
  WARNINGS="${WARNINGS}\n  - ⚠️ _index.md 없음 → 전체 인덱스 미생성"
fi

# 4. 최신 runs 파일에서 수집 로그 행 수 vs 노트 반영 비율 체크
LATEST_RUN=$(ls -t "$VAULT_PATH/runs/$TODAY"*.md 2>/dev/null | head -1)
if [ -n "$LATEST_RUN" ]; then
  TOTAL_ROWS=$(grep -c "^|.*|.*|.*|.*|.*|" "$LATEST_RUN" 2>/dev/null || echo 0)
  # 헤더+구분선 제외
  TOTAL_ROWS=$((TOTAL_ROWS > 2 ? TOTAL_ROWS - 2 : 0))
  REFLECTED=$(grep -c "✅" "$LATEST_RUN" 2>/dev/null || echo 0)

  if [ "$TOTAL_ROWS" -gt 0 ]; then
    RATIO=$((REFLECTED * 100 / TOTAL_ROWS))
    if [ "$RATIO" -lt 30 ]; then
      WARNINGS="${WARNINGS}\n  - ⚠️ 노트 반영률 ${RATIO}% (${REFLECTED}/${TOTAL_ROWS}) → 수집 대비 토픽화 부족"
    fi
  fi

  # 5. 수집 로그에 engagement 높은데 미반영인 항목 체크
  HIGH_ENG_MISSED=$(grep -E "❌.*\|.*[0-9]{3,}" "$LATEST_RUN" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$HIGH_ENG_MISSED" -gt 0 ]; then
    WARNINGS="${WARNINGS}\n  - ⚠️ engagement 높은 미반영 포스트 ${HIGH_ENG_MISSED}건 → 독립 토픽 검토 필요"
  fi
fi

# 6. topics/ 폴더에 wikilink 없는 고아 노트 체크
if [ -d "$VAULT_PATH/topics" ]; then
  for TOPIC_FILE in "$VAULT_PATH/topics/"*.md; do
    if [ -f "$TOPIC_FILE" ]; then
      BASENAME=$(basename "$TOPIC_FILE" .md)
      # 다른 파일에서 이 토픽을 참조하는지 확인
      REFS=$(grep -rl "\[\[$BASENAME\]\]" "$VAULT_PATH" --include="*.md" 2>/dev/null | grep -v "$TOPIC_FILE" | wc -l | tr -d ' ')
      if [ "$REFS" -eq 0 ]; then
        WARNINGS="${WARNINGS}\n  - ⚠️ 고아 토픽: $BASENAME → 다른 노트에서 참조 없음"
      fi
    fi
  done
fi

if [ -n "$WARNINGS" ]; then
  echo "📋 리서치 완료 체크:"
  echo -e "$WARNINGS"
fi
