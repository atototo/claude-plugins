#!/bin/bash
# Hook: PostToolUse on Write/Edit
# 목적: topics/ 파일에 인용구(> )와 wikilink([[]])가 있는지 검증

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null)

# topics/ 파일인지 확인
if echo "$FILE_PATH" | grep -q "topics/"; then
  if [ -f "$FILE_PATH" ]; then
    QUOTES=$(grep -c "^>" "$FILE_PATH" 2>/dev/null || echo 0)
    WIKILINKS=$(grep -co "\[\[" "$FILE_PATH" 2>/dev/null || echo 0)
    TIMELINE=$(grep -c "## 타임라인" "$FILE_PATH" 2>/dev/null || echo 0)
    RELATED=$(grep -c "## 관련" "$FILE_PATH" 2>/dev/null || echo 0)

    WARNINGS=""

    if [ "$QUOTES" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  - 원문 인용구(> ) 없음 → RAG 적중률 저하"
    fi

    if [ "$WIKILINKS" -lt 2 ]; then
      WARNINGS="${WARNINGS}\n  - wikilink 부족 (${WIKILINKS}개) → 그래프 연결 약함"
    fi

    if [ "$TIMELINE" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  - '## 타임라인' 섹션 없음"
    fi

    if [ "$RELATED" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  - '## 관련' 섹션 없음"
    fi

    if [ -n "$WARNINGS" ]; then
      echo "📋 토픽 노트 품질 체크: $(basename $FILE_PATH)"
      echo -e "$WARNINGS"
    fi
  fi
fi
