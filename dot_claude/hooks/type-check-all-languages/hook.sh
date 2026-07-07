#!/usr/bin/env bash
# ~/.claude/hooks/type-check-all-languages/hook.sh
#
# PostToolUse hook: type-checks the project after Claude edits/writes a file.
# Follows the pyrefly agentic-loop recommendation (pyrefly.org/blog/pyrefly-agentic-loop):
# run the type checker at the project root, send errors to stderr, exit 2 so
# Claude sees them and fixes before moving on.
#
# Unlike linting, type checkers need whole-project context, so we run at the
# root (no file arg) and only use the edited file's extension to pick the tool.

# Read tool_input.file_path from stdin JSON. Empty if not a file-editing tool.
F=$(jq -r '.tool_input.file_path // empty')

# No path or file doesn't exist → nothing to check, exit clean.
[[ -f "$F" ]] || exit 0

# Run checker. If binary missing, skip silently (exit 0).
# If it reports errors, send output to stderr (1>&2) and exit 2 to signal Claude.
check() { command -v "$1" >/dev/null || exit 0; "$@" 1>&2 || exit 2; }

# Dispatch on file extension. Checkers run project-wide from the current dir.
case "${F##*.}" in
  py)             check pyrefly check ;;
  ts|tsx|mts|cts) check tsc --noEmit ;;
esac
