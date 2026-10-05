#!/usr/bin/env bash
# ~/.claude/hooks/format-staged-files/hook.sh
#
# Git pre-commit hook, not a Claude Code hook: formats the staged files through
# format-all-languages and format-org-tables, then stages the result, so the
# commit holds the formatted text. A Bash command that writes a file and commits
# it in one call gets past the PostToolUse formatters, which run after the
# commit. ~/.config/git/config sets this hook for every commit, and the gate
# below limits it to agent sessions. Never stops a commit: always exits 0.
# Design notes: README.md.

# --- Preflight ---
set -u
# Claude Code sets CLAUDECODE=1 in the processes it starts. Your own commits
# do not get the hook.
[[ "${CLAUDECODE:-}" == 1 ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0
HOOKS=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# Git runs a pre-commit hook at the root already. `git hook run` from a
# subdirectory does not, and the formatters resolve .prettierignore from here.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# --- Format and restage ---
# --cached reads $GIT_INDEX_FILE, so `commit -a` and `commit <path>`, which
# build a temporary index, get the files they are about to commit.
# shortcut: one formatter run per file, ~0.4s each for Prettier. The upgrade is
# a list mode in format-all-languages, so one Prettier run takes every file.
while IFS= read -r -d '' rel; do
  f=$root/$rel
  [[ -f "$f" && ! -L "$f" ]] || continue
  # Unstaged changes in the same file: `git add` would commit those too.
  git diff --quiet -- "$rel" || continue
  before=$(cksum <"$f")
  payload=$(jq -nc --arg f "$f" '{hook_event_name: "PostToolUse", tool_input: {file_path: $f}}')
  bash "$HOOKS/format-all-languages/hook.sh" <<<"$payload" >/dev/null 2>&1
  bash "$HOOKS/format-org-tables/hook.sh" <<<"$payload" >/dev/null 2>&1
  [[ "$(cksum <"$f")" == "$before" ]] || git add -- "$rel"
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

exit 0
