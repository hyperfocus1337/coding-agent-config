#!/bin/bash
set -e

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

if [[ "$FILE_PATH" == *.md || "$FILE_PATH" == *.markdown ]]; then
  if command -v prettier >/dev/null 2>&1; then
    prettier --prose-wrap always --write "$FILE_PATH" >/dev/null 2>&1 || true
  fi
fi
