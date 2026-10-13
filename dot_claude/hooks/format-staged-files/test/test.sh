#!/usr/bin/env bash
# Smoke test for hook.sh, wired through GIT_CONFIG_* environment variables that
# set the same config-based pre-commit hook as ~/.config/git/config, so the test
# does not depend on that file. Run: bash test.sh
# Needs jq and prettier, or the hook does nothing, so it skips loudly instead.
# Needs a git with config-based hooks (hook.<name>.command, git-config(1)); an
# older git fails the first check.
# The Org case also needs emacs and skips alone without it.
set -u

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hook.sh"
for bin in jq git prettier; do
  command -v "$bin" >/dev/null 2>&1 || { echo "SKIP no $bin on PATH"; exit 0; }
done

# Not mktemp's default: the formatters skip /tmp and $TMPDIR on purpose, so a
# fixture there would be skipped along with them.
tmp=$(mktemp -d "${HOME}/.format-staged-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
fail=0

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
export CLAUDECODE=1
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0=hook.claude-format-staged.event GIT_CONFIG_VALUE_0=pre-commit
export GIT_CONFIG_KEY_1=hook.claude-format-staged.command GIT_CONFIG_VALUE_1="bash \"$HOOK\""

check() { if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FAIL $1: got [$2], want [$3]"; fail=1; fi; }
committed() { git -C "$tmp" show "HEAD:$1"; }
dirty() { git -C "$tmp" status --porcelain; }

git -C "$tmp" init -q
git -C "$tmp" commit -q --allow-empty -m init

# Prettier rewrites a `*` bullet to `-`.
printf '*   one\n' >"$tmp/new.md"
git -C "$tmp" add new.md
err=$(git -C "$tmp" commit -q -m new 2>&1)
check "a staged new file is committed formatted" "$(committed new.md)" "- one"
check "a restage is reported on stderr" "$err" "format-staged-files: reformatted and restaged new.md"
check "the tree is clean after the commit" "$(dirty)" ""

# Write and commit in one call, the case the PostToolUse formatters miss.
printf '*   two\n' >"$tmp/new.md"
git -C "$tmp" commit -q -a -m "commit -a"
check "commit -a formats the tracked file" "$(committed new.md)" "- two"
check "the tree is clean after commit -a" "$(dirty)" ""

# A file with unstaged changes stays as staged, and the unstaged part stays out.
printf '*   three\n' >"$tmp/new.md"
git -C "$tmp" add new.md
printf '*   three\n*   unstaged\n' >"$tmp/new.md"
git -C "$tmp" commit -q -m partial
check "a partly staged file is committed as staged" "$(committed new.md)" "*   three"
check "the unstaged change stays in the tree" "$(cat "$tmp/new.md")" "$(printf '*   three\n*   unstaged')"
git -C "$tmp" checkout -q -- new.md

if command -v emacs >/dev/null 2>&1; then
  printf '| a | bbbb |\n| cccc | d |\n' >"$tmp/t.org"
  git -C "$tmp" add t.org && git -C "$tmp" commit -q -m org
  check "an Org table is committed aligned" "$(committed t.org | head -1)" "| a    | bbbb |"
else
  echo "SKIP no emacs on PATH: Org case"
fi

# A file no formatter handles is committed unchanged.
printf 'x  =  1\n' >"$tmp/a.txt"
git -C "$tmp" add a.txt
err=$(git -C "$tmp" commit -q -m txt 2>&1)
check "a file no formatter handles is unchanged" "$(committed a.txt)" "x  =  1"
check "an unchanged file is not reported" "$err" ""

# Outside Claude Code the hook does nothing.
printf '*   four\n' >"$tmp/new.md"
CLAUDECODE='' git -C "$tmp" commit -q -a -m "no agent"
check "a commit outside Claude Code is not formatted" "$(committed new.md)" "*   four"

exit "$fail"
