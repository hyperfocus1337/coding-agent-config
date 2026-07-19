#!/usr/bin/env bash
# Stage the file Claude just wrote/edited so it lands in `git status`
# pre-staged. Silent no-op outside a git repo, on gitignored paths,
# on failed tool calls, or on common secret filenames.
#
# Known limitation: if a user has a partial `git add -p` selection
# staged for a file and Claude then edits it, this will re-stage the
# whole file, dropping their hunk selection.

# --- Shell options and dependencies ---
# Error on unset vars; intentionally no `-e` so a non-zero git/jq
# never aborts the hook mid-way and leaves Claude staring at stderr.
set -u

# If `jq` isn't installed, self-disable rather than spam "command not
# found" on every tool call.
command -v jq >/dev/null 2>&1 || exit 0

# --- Read payload ---
# Slurp the JSON payload from stdin once so we can query it twice
# without consuming the pipe.
payload=$(cat)

# --- Skip failed tool calls ---
# PostToolUse fires for failed tool calls too (e.g. Edit with a
# non-unique `old_string`). Don't stage when the underlying write
# didn't actually happen. Default to true only when the field is
# absent/null (older payload shapes) — `// true` alone won't do, since
# jq's `//` also swallows an explicit `false`, treating failures as
# successes.
success=$(jq -r 'if .tool_response.success == false then "false" else "true" end' <<<"$payload")
[ "$success" = "true" ] || exit 0

# --- Resolve target file and repo ---
# The path Claude wrote to. Empty on tool calls that don't carry one.
file=$(jq -r '.tool_input.file_path // empty' <<<"$payload")
[ -z "$file" ] && exit 0

# Prefer Claude Code's project root; fall back to the file's dir for
# cross-repo edits where the hook fires outside the main project.
repo="${CLAUDE_PROJECT_DIR:-$(dirname "$file")}"

# --- Gitignore guard (unstage, never stage) ---
# Gitignored files must never be staged; unstage and bail if the path
# matches an ignore rule. Runs before the secret-name check below so a
# gitignored credential that's already staged still gets unstaged. See
# README for the cases this guards and why `--no-index` is needed.
if git -C "$repo" check-ignore -q --no-index -- "$file" 2>/dev/null; then
  git -C "$repo" restore --staged -- "$file" 2>/dev/null
  # A gitignored path still tracked in HEAD is an anomaly: it was
  # committed before the ignore rule existed. Surface it to Claude
  # (non-blocking) so it can flag it; routine ignores stay silent.
  if [ -n "$(git -C "$repo" ls-tree -r --name-only HEAD -- "$file" 2>/dev/null)" ]; then
    jq -n --arg f "$file" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:("Note for the user: \($f) is gitignored but still tracked in git (committed before it was ignored). The edit was left unstaged. They may want `git rm --cached` to stop tracking it.")}}'
  fi
  exit 0
fi

# --- Secret-filename guard ---
# Refuse to auto-stage files that look like secrets but aren't
# gitignored (a misplaced Write dropping a credential into a tracked
# directory). Gitignore is the real defence and ran just above. The
# classifier is shared with the block-secret-commits hook so both use
# the same list. See _shared/secret-filenames.sh.
source "$(dirname "${BASH_SOURCE[0]}")/../_shared/secret-filenames.sh"
is_dangerous "${file##*/}" && exit 0

# --- Stage ---
# Swallow git's stderr: outside-repo, gitignored, or already-staged
# all surface here and none warrant blocking the tool call.
git -C "$repo" add -- "$file" 2>/dev/null

# Explicit exit 0 — never propagate a failure upstream.
exit 0
