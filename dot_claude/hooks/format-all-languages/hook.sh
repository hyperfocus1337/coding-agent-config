#!/usr/bin/env bash
# ~/.claude/hooks/format-all-languages/hook.sh
#
# PostToolUse hook: formats files after Claude edits/writes them.
# Claude pipes tool event JSON to stdin; we extract the file path and,
# for prettier-supported extensions, rewrite the file in place with
# `prettier --write`. Formatting never blocks Claude: this hook always
# exits 0, so a missing prettier or a parse error just leaves the file
# untouched.

# Read tool_input.file_path from stdin JSON. Empty if not a file-editing tool.
F=$(jq -r '.tool_input.file_path // empty')

# No path or file doesn't exist → nothing to format, exit clean.
[[ -f "$F" ]] || exit 0

# Only touch extensions prettier handles natively. Anything else exits
# clean so we never spawn npx for, say, .py or .go files.
case "${F##*.}" in
  md|markdown|js|jsx|ts|tsx|mjs|cjs|json|css|scss|html|yml|yaml) ;;
  *) exit 0 ;;
esac

# Format in place. --no-install so we use a global or project-local
# prettier but never trigger a network install. --prose-wrap never keeps
# prose on one line: markdown/MDX paragraphs and YAML block scalars (no
# effect on json/js/ts/css). Errors (no prettier, parse failure) are
# swallowed; a formatter never fails an edit.
npx --no-install prettier --write --prose-wrap never "$F" >/dev/null 2>&1

exit 0
