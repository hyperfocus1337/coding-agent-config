#!/usr/bin/env bash
# Print how the code files of type-check-pyrefly differ from type-check-tsc,
# with no line numbers, so that code that moves in both hooks gives the same
# output. check.sh compares the output with type-check.diff, so that a change
# to one hook that the other does not get fails the check.
#
# After a change that is meant to differ, write the new diff:
#   scripts/extensions/hooks/type-check-diff.sh >scripts/extensions/hooks/type-check.diff
set -euo pipefail

HOOKS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/dot_claude/hooks"

for file in command.ts core.ts io.ts omp.ts pi.ts; do
  echo "=== ${file}"
  # The header ends at the first @@ line, and each @@ line holds line
  # numbers. git diff exits 1 when the files differ.
  git diff --no-index --no-color -U0 \
    "${HOOKS}/type-check-tsc/${file}" "${HOOKS}/type-check-pyrefly/${file}" |
    awk '/^@@/ { hunk = 1; next } hunk' || true
done
