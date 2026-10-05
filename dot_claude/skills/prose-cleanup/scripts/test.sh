#!/usr/bin/env bash
# Smoke test for scan.sh: each input form, the .txt rule, and the exit codes.
# Run: bash test.sh. Needs vale, fd, and git on PATH.
set -u

SCAN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scan.sh"
for bin in vale fd git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "SKIP no $bin on PATH"; exit 0; }
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

# Run scan.sh in $tmp/repo, capture stdout and stderr and the exit status.
run() { out=$(cd "$tmp/repo" && bash "$SCAN" "$@" 2>&1); status=$?; }

check() { # name, expected status, expected substring in output ('' for none)
  if [[ "$status" -ne "$2" ]]; then
    echo "FAIL $1: exit $status, wanted $2"; fail=1; return
  fi
  if [[ -n "$3" && "$out" != *"$3"* ]]; then
    echo "FAIL $1: output does not hold '$3'"; fail=1; return
  fi
  echo "ok   $1"
}

long='One. Two. Three. Four. Five. Six. Seven, the last sentence here.'
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
git init -q "$tmp/repo"
mkdir "$tmp/repo/docs"
printf '%s\n' "$long" > "$tmp/repo/docs/old.md"
printf '%s\n' "$long" > "$tmp/repo/notes.txt"
printf 'Short.\n' > "$tmp/repo/new.org"
git -C "$tmp/repo" add . && git -C "$tmp/repo" commit -q -m init

run
check "no input: the whole repository" 1 'docs/old.md:1:'
[[ "$out" == *notes.txt* ]] && { echo "FAIL a .txt file in a directory is checked"; fail=1; } \
  || echo "ok   a .txt file in a directory is not checked"

run notes.txt
check "a named .txt file is checked" 1 'notes.txt:1:'

run --changed
check "--changed: no change, no alert" 0 ''

printf '%s\n' "$long" > "$tmp/repo/new.org"
run --changed
check "--changed: only the changed file" 1 'new.org:1:'
[[ "$out" == *old.md* ]] && { echo "FAIL --changed checked an unchanged file"; fail=1; } \
  || echo "ok   --changed leaves unchanged files out"

run missing.md
check "a bad path stops the scan" 2 'no such file'

exit "$fail"
