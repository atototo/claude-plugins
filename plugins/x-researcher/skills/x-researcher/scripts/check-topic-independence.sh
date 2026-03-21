#!/bin/bash
# Hook: PostToolUse on Write/Edit
# 목적: topics/ 파일 작성 시 하나의 토픽 노트에 하위 항목이 과도하게 쌓이면 독립 분리 제안

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null)

# topics/ 파일인지 확인
if echo "$FILE_PATH" | grep -q "topics/"; then
  if [ -f "$FILE_PATH" ]; then
    BASENAME=$(basename "$FILE_PATH" .md)

    # 타임라인 항목 수 세기 (** 로 시작하는 볼드 항목 = 개별 포스트/뉴스)
    TIMELINE_ITEMS=$(grep -c "^\*\*" "$FILE_PATH" 2>/dev/null || echo 0)

    # engagement 100+ 항목 수
    HIGH_ENG=$(grep -oE "❤️[0-9,.]+" "$FILE_PATH" 2>/dev/null | sed 's/❤️//;s/,//g' | awk '$1 >= 100' | wc -l | tr -d ' ')

    WARNINGS=""

    # 하위 항목이 8개 이상이면 분리 검토 제안
    if [ "$TIMELINE_ITEMS" -gt 8 ]; then
      WARNINGS="${WARNINGS}\n  - 📊 ${BASENAME}: 타임라인 항목 ${TIMELINE_ITEMS}개 → 하위 토픽 분리 검토"
    fi

    # engagement 100+ 항목이 3개 이상이면 독립 토픽 후보 알림
    if [ "$HIGH_ENG" -gt 3 ]; then
      WARNINGS="${WARNINGS}\n  - 🔥 ${BASENAME}: 고반응(❤️100+) 항목 ${HIGH_ENG}개 → 독립 토픽 분리 대상 확인"
    fi

    if [ -n "$WARNINGS" ]; then
      echo "🔍 토픽 독립성 체크:"
      echo -e "$WARNINGS"
    fi
  fi
fi
