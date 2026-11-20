#!/usr/bin/env bash
# Lint the changed and untracked files of this repository before you report a change as done:
#   1. lint-code, through the command.ts that its Stop hook runs: only changed and untracked files,
#   2. Vale on the changed Markdown files, which also reports the old alerts of each file,
#   3. oxfmt --check.
# A failed step does not stop the later steps. The script exits 1 when a step fails.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1

files=() md=()
# A while-read loop, not mapfile, because macOS ships bash 3.2.
while IFS= read -r f; do
  files+=("$f")
  case $f in *.md | *.markdown) md+=("$f") ;; esac
done < <({
  git diff --name-only --diff-filter=d HEAD
  git ls-files --others --exclude-standard
} | sort -u)

status=0
echo '{}' | node dot_claude/hooks/lint-code/command.ts || status=1
if ((${#md[@]})); then bash dot_config/vale/scripts/check.sh "${md[@]}" || status=1; fi
if ((${#files[@]})); then oxfmt --check --no-error-on-unmatched-pattern "${files[@]}" || status=1; fi
exit "$status"
