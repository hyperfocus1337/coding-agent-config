#!/usr/bin/env bash
# ~/.claude/hooks/type-check-all-languages/hook.sh
#
# Stop hook: type-checks the project once, after Claude finishes responding.
# Follows the pyrefly agentic-loop recommendation (pyrefly.org/blog/pyrefly-agentic-loop):
# run the type checker at the project root, send errors to stderr, exit 2 so
# Claude sees them and fixes them.
#
# It runs on Stop, not PostToolUse, because a type checker needs whole-project
# context. On PostToolUse it rechecks the whole project after every edit and
# reprints the same unrelated errors each time. Once per turn costs one run, and
# exit 2 still blocks the turn until the errors are gone.

IN=$(cat)

# --- Loop guard ---
# stop_hook_active is true when this hook already blocked one stop. A check that
# still fails would block every stop after it, so report success on the second
# round and let the turn end.
[[ $(jq -r '.stop_hook_active // false' <<<"$IN") == true ]] && exit 0

# --- Resolve the changed files ---
# Stop carries no file path, so ask git what changed: tracked edits against HEAD
# plus untracked files. Outside a work tree there is nothing to compare, so skip.
# ponytail: a git diff also covers work from before the session. The upgrade is
# to read the edited paths out of the transcript at .transcript_path.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
CHANGED=$({ git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null)

# --- Checker helper ---
# Run checker. If binary missing, skip silently. If it reports errors, send its
# output to stderr (1>&2) and record the failure. Both checkers run, so one turn
# reports every language instead of stopping at the first.
FAILED=0
check() { command -v "$1" >/dev/null || return 0; "$@" 1>&2 || FAILED=2; }

# Pick checkers by the extensions present. They run project-wide from the current
# dir, so the file list only decides which checker starts.
grep -q '\.py$' <<<"$CHANGED" && check pyrefly check
# tsc with no tsconfig.json prints its whole help text and exits 1, so require one.
grep -qE '\.(ts|tsx|mts|cts)$' <<<"$CHANGED" && [[ -f tsconfig.json ]] && check tsc --noEmit

[[ "$FAILED" -eq 0 ]] || echo "Type check failed. Fix the errors above, then stop." 1>&2
exit "$FAILED"
