#!/usr/bin/env bash
# ~/.claude/hooks/lint-all-languages/hook.sh
#
# PostToolUse hook: lints files after Claude edits/writes them.
# Claude pipes tool event JSON to stdin; we extract the file path and
# run the matching linter. Exit 2 = block tool result and surface stderr
# back to Claude so it can fix the issue.

# --- Resolve target file ---
# Read tool_input.file_path from stdin JSON. Empty if not a file-editing tool.
F=$(jq -r '.tool_input.file_path // empty')

# No path or file doesn't exist → nothing to lint, exit clean.
[[ -f "$F" ]] || exit 0

# --- Linter helper ---
# Run linter with args. If binary missing, skip silently (exit 0).
# If linter fails, send its output to stderr (1>&2) and exit 2 to signal
# Claude that the edit produced lint errors.
lint() { command -v "$1" >/dev/null || exit 0; "$@" 1>&2 || exit 2; }

# --- Ansible detection ---
# ansible-lint should only touch Ansible YAML, not every .yml. Match by path
# (standard Ansible dirs / entrypoint names) or by content markers.
is_ansible() {
  [[ "$F" =~ /(roles|tasks|handlers|playbooks|group_vars|host_vars|molecule)/ ]] && return 0
  [[ "$(basename "$F")" =~ ^(site|playbook|main|requirements)\.ya?ml$ ]] && return 0
  grep -qE '^\s*(- )?(hosts|tasks|roles|ansible\.builtin\.):' "$F"
}

# --- Dispatch by extension ---
# Dispatch on file extension (${F##*.} = suffix after last dot).
case "${F##*.}" in
  py)                    lint ruff check --quiet "$F" ;;
  js|jsx|ts|tsx|mjs|cjs) lint oxlint "$F" ;;
  sh|bash)               lint shellcheck -S warning "$F" ;;
  yml|yaml)              if is_ansible; then lint ansible-lint -q "$F"; else lint yamllint -d relaxed "$F"; fi ;;
  tf|tfvars)             lint terraform fmt -check -diff "$F" ;;
esac
