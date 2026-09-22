#!/usr/bin/env bash
# ~/.claude/hooks/lint-all-languages/hook.sh
#
# PostToolUse and PostToolUseFailure hook: lints files after Claude changes
# them. Claude pipes tool event JSON to stdin. On Write/Edit the payload names
# the file. On Bash it names none, so the hook lints the paths the command text
# holds, and only the ones the command just wrote. Exit 2 = block the tool
# result and surface stderr back to Claude so it can fix the issue.
# See README "Bash (the paths the command just wrote)".

# --- Preflight ---
# No jq: self-disable, rather than erroring on every tool call.
set -u
command -v jq >/dev/null 2>&1 || exit 0

# --- Bundled linter configs ---
# Directory of this script; holds the config/ the linters run against on every
# invocation. Tune the defaults by editing config/.yamllint and
# config/.ansible-lint.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CFG="$HERE/config"

# --- Read payload ---
payload=$(cat)
edited_file=$(jq -r '.tool_input.file_path // empty' <<<"$payload")

candidates=()
if [[ -n "$edited_file" ]]; then
  # Write/Edit: the one file named.
  candidates+=("$edited_file")
else
  # Bash: no file named, so read the paths out of the command text instead,
  # the way format-org-tables does. README "Bash (the paths the command just
  # wrote)".
  cwd=$(jq -r '.cwd // empty' <<<"$payload")
  [[ -n "$cwd" ]] || cwd=$PWD
  cmd=$(jq -r '.tool_input.command // empty' <<<"$payload")

  # A named path the command only read must not be linted: blocking `cat
  # app.py` on an error that was already there helps nobody. A file the command
  # wrote carries a fresh mtime, so that is the test.
  # ponytail: a command that writes early and then runs for minutes falls
  # outside the window and is missed. The upgrade is a PreToolUse hook that
  # stamps the start time for the matching call to compare against.
  now=$(date +%s)
  while IFS= read -r path; do
    [[ "$path" == /* ]] || path=$cwd/$path
    [[ -f "$path" ]] || continue
    mtime=$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path" 2>/dev/null)
    [[ -n "$mtime" ]] || continue
    [[ $((now - mtime)) -le 120 ]] && candidates+=("$path")
  done < <(grep -oE '[^[:space:]:;|&"'"'"'`()<>=]+\.(py|jsx?|tsx?|mjs|cjs|sh|bash|ya?ml|tfvars|tf)\b' <<<"$cmd")
fi

# --- Filter ---
# Keep what exists, drop duplicates (one command names the same file twice
# often enough), and skip throwaway files: scratchpad and temp files are not
# project code, so lint errors there should not block a tool result.
# macOS resolves /tmp to /private/tmp and $TMPDIR to /private/var/folders/...,
# and the scratchpad path Claude writes to carries that /private prefix, so
# both sides of the comparison drop it.
tmpdir=${TMPDIR:-/nonexistent}
tmpdir=${tmpdir#/private}
targets=()
for f in "${candidates[@]-}"; do
  [[ -f "$f" ]] || continue
  p=${f#/private}
  [[ "$p" == /tmp/* || "$p" == /var/tmp/* || "$p" == "$tmpdir"* ]] && continue
  [[ " ${targets[*]-} " == *" $f "* ]] && continue
  targets+=("$f")
done
[[ ${#targets[@]} -gt 0 ]] || exit 0

# --- Per-language off switch ---
# CLAUDE_LINT_DISABLE = space/comma list of keys to skip (py js sh yaml tf),
# or "all" to disable the hook entirely. To *tune* rather than disable YAML,
# edit the bundled configs in config/; both YAML linters run with -c against
# them, so a repo's own .yamllint / .ansible-lint is never read.
# set -u and an unset variable do not mix, and the default must be applied
# before the pattern substitution, not inside it.
lint_disable=${CLAUDE_LINT_DISABLE:-}
DISABLE=" ${lint_disable//,/ } "
disabled() { [[ "$DISABLE" == *" all "* || "$DISABLE" == *" $1 "* ]]; }

# --- Linter helper ---
# Run linter with args. If binary missing, skip silently. If the linter fails,
# send its output to stderr (1>&2) and record it. Every target is linted, so
# one Bash call reports every file it wrote instead of stopping at the first.
FAILED=0
lint() { command -v "$1" >/dev/null || return 0; "$@" 1>&2 || FAILED=2; }

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
for F in "${targets[@]}"; do
  case "${F##*.}" in
    py)                    disabled py   || lint ruff check --quiet "$F" ;;
    js|jsx|ts|tsx|mjs|cjs) disabled js   || lint oxlint "$F" ;;
    sh|bash)               disabled sh   || lint shellcheck -S warning "$F" ;;
    yml|yaml)              disabled yaml && continue
                           if is_ansible; then lint ansible-lint -c "$CFG/.ansible-lint" -q "$F"; else lint yamllint -c "$CFG/.yamllint" "$F"; fi ;;
    tf|tfvars)             disabled tf   || lint terraform fmt -check -diff "$F" ;;
  esac
done

exit "$FAILED"
