#!/usr/bin/env bash
# ~/.claude/hooks/lint-all-languages/hook.sh
#
# PostToolUse hook: lints files after Claude edits/writes them.
# Claude pipes tool event JSON to stdin; we extract the file path and
# run the matching linter. Exit 2 = block tool result and surface stderr
# back to Claude so it can fix the issue.

# --- Bundled linter configs ---
# Directory of this script; holds the config/ the linters run against on every
# invocation. Tune the defaults by editing config/.yamllint and
# config/.ansible-lint.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CFG="$HERE/config"

# --- Resolve target file ---
# Read tool_input.file_path from stdin JSON. Empty if not a file-editing tool.
F=$(jq -r '.tool_input.file_path // empty')

# No path or file doesn't exist → nothing to lint, exit clean.
[[ -f "$F" ]] || exit 0

# --- Skip throwaway files ---
# Scratchpad/temp files aren't project code, so lint errors there shouldn't
# block a tool result.
[[ "$F" == /tmp/* || "$F" == /var/tmp/* || "$F" == "${TMPDIR:-/nonexistent}"* ]] && exit 0

# --- Per-language off switch ---
# CLAUDE_LINT_DISABLE = space/comma list of keys to skip (py js sh yaml tf),
# or "all" to disable the hook entirely. To *tune* rather than disable YAML,
# edit the bundled configs in config/; both YAML linters run with -c against
# them, so a repo's own .yamllint / .ansible-lint is never read.
DISABLE=" ${CLAUDE_LINT_DISABLE//,/ } "
disabled() { [[ "$DISABLE" == *" all "* || "$DISABLE" == *" $1 "* ]]; }

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
  py)                    disabled py   || lint ruff check --quiet "$F" ;;
  js|jsx|ts|tsx|mjs|cjs) disabled js   || lint oxlint "$F" ;;
  sh|bash)               disabled sh   || lint shellcheck -S warning "$F" ;;
  yml|yaml)              disabled yaml && exit 0
                         if is_ansible; then lint ansible-lint -c "$CFG/.ansible-lint" -q "$F"; else lint yamllint -c "$CFG/.yamllint" "$F"; fi ;;
  tf|tfvars)             disabled tf   || lint terraform fmt -check -diff "$F" ;;
esac
