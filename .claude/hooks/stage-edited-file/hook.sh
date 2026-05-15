#!/usr/bin/env bash
# Stage the file Claude just wrote/edited so it lands in `git status`
# pre-staged. Silent no-op outside a git repo, on gitignored paths,
# on failed tool calls, or on common secret filenames.
#
# Known limitation: if a user has a partial `git add -p` selection
# staged for a file and Claude then edits it, this will re-stage the
# whole file, dropping their hunk selection.

# Error on unset vars; intentionally no `-e` so a non-zero git/jq
# never aborts the hook mid-way and leaves Claude staring at stderr.
set -u

# If `jq` isn't installed, self-disable rather than spam "command not
# found" on every tool call.
command -v jq >/dev/null 2>&1 || exit 0

# Slurp the JSON payload from stdin once so we can query it twice
# without consuming the pipe.
payload=$(cat)

# PostToolUse fires for failed tool calls too (e.g. Edit with a
# non-unique `old_string`). Don't stage when the underlying write
# didn't actually happen. Default to true for older payload shapes
# that omit the field.
success=$(jq -r '.tool_response.success // true' <<<"$payload")
[ "$success" = "true" ] || exit 0

# The path Claude wrote to. Empty on tool calls that don't carry one.
file=$(jq -r '.tool_input.file_path // empty' <<<"$payload")
[ -z "$file" ] && exit 0

# Refuse to auto-stage files that look like secrets. Gitignore is the
# real defence, but this catches the case where a misplaced Write
# drops a credential into a tracked directory.
case "$(basename "$file")" in
  .env|.envrc|.env.*|*.pem|*.key|id_rsa*|id_ed25519*) exit 0 ;;
esac

# Prefer Claude Code's project root; fall back to the file's dir for
# cross-repo edits where the hook fires outside the main project.
repo="${CLAUDE_PROJECT_DIR:-$(dirname "$file")}"

# Swallow git's stderr: outside-repo, gitignored, or already-staged
# all surface here and none warrant blocking the tool call.
git -C "$repo" add -- "$file" 2>/dev/null

# Explicit exit 0 — never propagate a failure upstream.
exit 0
