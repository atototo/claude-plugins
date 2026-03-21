#!/bin/bash
# Hook: PreToolUse on Write/Edit
# 목적: daily/ 또는 runs/ 파일에 토픽 설명 텍스트가 길게 들어가면 경고 (벡터 오염 방지)
# daily/runs는 링크 허브/로그 역할만 해야 함

# stdin으로 tool_input JSON이 들어옴
INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null)
CONTENT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('content','') or d.get('new_string',''))" 2>/dev/null)

# daily/ 또는 runs/ 파일인지 확인
if echo "$FILE_PATH" | grep -qE "(daily|runs)/"; then
  # 내용 길이 체크 (daily/runs에 500자 이상 연속 텍스트 블록이 있으면 경고)
  LONG_LINES=$(echo "$CONTENT" | awk 'length > 200 && !/^\|/ && !/^-/ && !/^#/ && !/^\[/' | wc -l)
  if [ "$LONG_LINES" -gt 2 ]; then
    echo "⚠️ 벡터 오염 주의: daily/runs 파일에 긴 설명 텍스트가 포함됩니다."
    echo "daily/runs는 wikilink 허브/로그 역할만 해야 합니다."
    echo "상세 내용은 topics/ 또는 entities/ 노트에 작성하세요."
    echo "파일: $FILE_PATH"
  fi
fi
