#!/usr/bin/env bash
# ~/.claude/hooks/lint-prose/hook.sh
#
# PostToolUse and PostToolUseFailure hook: lints the prose in Markdown, Org,
# and HTML files after Claude changes them, through check.sh and Vale. On
# Write/Edit the payload names the file. On Bash it names none, so the hook
# checks the paths the command text holds, and only the ones the command just
# wrote. Exit 2 = block the tool result and surface stderr back to Claude.
# Design notes and the rules: docs/implementation.md.

# --- Preflight ---
set -u
command -v jq >/dev/null 2>&1 || exit 0
command -v vale >/dev/null 2>&1 || exit 0
# The same off switch as lint-all-languages: "prose" or "all" turns this off.
lint_disable=" ${CLAUDE_LINT_DISABLE:-} "
lint_disable=${lint_disable//,/ }
[[ "$lint_disable" == *" all "* || "$lint_disable" == *" prose "* ]] && exit 0
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# --- Read payload ---
payload=$(cat)
edited_file=$(jq -r '.tool_input.file_path // empty' <<<"$payload")

candidates=()
touched=''
if [[ -n "$edited_file" ]]; then
  # Write/Edit: the one file named.
  candidates+=("$edited_file")
  # Edit/MultiEdit: the text the edit wrote, so old paragraphs elsewhere in the
  # file do not block it. Empty on Write: the whole file. A blank line apart,
  # so two edits do not join into one paragraph.
  # shortcut: an edit that adds a sentence to an existing paragraph is checked
  # without the rest of that paragraph; the next Write of the file catches it.
  # Upgrade: map Vale's whole-file alerts to the lines the edit changed.
  touched=$(jq -r '[.tool_input.new_string // empty, (.tool_input.edits // [])[].new_string] | join("\n\n")' <<<"$payload")
else
  # Bash: no file named, so read the paths out of the command text instead,
  # the way lint-all-languages does, and keep the ones with a fresh mtime: a
  # path the command only read must not block it. lint-all-languages README
  # "Bash (the paths the command just wrote)".
  cwd=$(jq -r '.cwd // empty' <<<"$payload")
  [[ -n "$cwd" ]] || cwd=$PWD
  cmd=$(jq -r '.tool_input.command // empty' <<<"$payload")
  now=$(date +%s)
  while IFS= read -r path; do
    [[ "$path" == /* ]] || path=$cwd/$path
    [[ -f "$path" ]] || continue
    mtime=$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path" 2>/dev/null)
    [[ -n "$mtime" ]] || continue
    [[ $((now - mtime)) -le 120 ]] && candidates+=("$path")
  done < <(grep -oE '[^[:space:]:;|&"'"'"'`()<>=]+\.(md|markdown|org|html?)\b' <<<"$cmd")
fi

# --- Filter ---
# Keep prose files that exist, drop duplicates, and skip temp files: scratchpad
# prose is not project prose. Both sides drop /private, because macOS resolves
# /tmp and $TMPDIR under it.
tmpdir=${TMPDIR:-/nonexistent}
tmpdir=${tmpdir#/private}
targets=()
for f in "${candidates[@]-}"; do
  [[ -f "$f" && "$f" =~ \.(md|markdown|org|html?)$ ]] || continue
  p=${f#/private}
  [[ "$p" == /tmp/* || "$p" == /var/tmp/* || "$p" == "$tmpdir"* ]] && continue
  [[ " ${targets[*]-} " == *" $f "* ]] && continue
  targets+=("$f")
done
[[ ${#targets[@]} -gt 0 ]] || exit 0

# --- Check ---
if [[ -n "$touched" ]]; then
  bash "$HERE/check.sh" --ext=".${targets[0]##*.}" <<<"$touched" 1>&2 || exit 2
else
  bash "$HERE/check.sh" "${targets[@]}" 1>&2 || exit 2
fi
exit 0
