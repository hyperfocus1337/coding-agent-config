#!/usr/bin/env bash
# Print how the copied files of a set of hooks differ from the first hook of
# the set, with no line numbers, so that code that moves in all hooks gives the
# same output. check.sh compares the output with <set>.diff, so that a change
# to one hook that the others do not get fails the check. The sets:
#   type-check: type-check-pyrefly against type-check-tsc.
#
# After a change that is meant to differ, write the new diff:
#   scripts/extensions/hooks/hook-diff.sh <set> >scripts/extensions/hooks/<set>.diff
set -euo pipefail

HOOKS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/dot_claude/hooks"

case "${1:-}" in
  type-check)
    base=type-check-tsc others=(type-check-pyrefly)
    files=(command.ts core.ts io.ts omp.ts pi.ts)
    ;;
  *)
    echo "usage: $0 type-check" >&2
    exit 2
    ;;
esac

for other in "${others[@]}"; do
  for file in "${files[@]}"; do
    echo "=== ${other}/${file}"
    # The header ends at the first @@ line, and each @@ line holds line
    # numbers. git diff exits 1 when the files differ.
    git diff --no-index --no-color -U0 "${HOOKS}/${base}/${file}" "${HOOKS}/${other}/${file}" |
      awk '/^@@/ { hunk = 1; next } hunk' || true
  done
done
