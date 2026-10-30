#!/usr/bin/env bash
# Smoke test for scan.sh: each input form, the .txt rule, --config, the report
# file, and the exit codes.
# Run: bash test.sh. Needs vale, fd, and git on PATH.
set -u

SCAN="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/scan.sh"
# The Vale config in the chezmoi source, not the applied copy in ~/.config.
LINT_PROSE_VALE_DIR="$(cd "${SCAN%/*}/../../../../dot_config/vale" && pwd)"
export LINT_PROSE_VALE_DIR
for bin in vale fd git; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "SKIP no $bin on PATH"
    exit 0
  }
done

# Physical, like the git root that scan.sh names the report directory after.
tmp=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$tmp"' EXIT
fail=0
# The reports go to $tmp/state/prose-cleanup/repo/, not to the real state.
export HOME=$tmp XDG_STATE_HOME=$tmp/state

# Run scan.sh in $tmp/repo, capture stdout and stderr and the exit status, and
# add the report file to the output.
run() {
  out=$(cd "$tmp/repo" && bash "$SCAN" "$@" 2>&1)
  status=$?
  report=$(sed -n 's/^report: //p' <<<"$out")
  [[ -f "$report" ]] && out+=$'\n'$(<"$report")
}

check() { # name, expected status, expected substring in output ('' for none)
  if [[ "$status" -ne "$2" ]]; then
    echo "FAIL $1: exit $status, wanted $2"
    fail=1
    return
  fi
  if [[ -n "$3" && "$out" != *"$3"* ]]; then
    echo "FAIL $1: output does not hold '$3'"
    fail=1
    return
  fi
  echo "ok   $1"
}

long='One. Two. Three. Four. Five. Six, the last sentence here.'
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
git init -q "$tmp/repo"
mkdir "$tmp/repo/docs"
printf '%s\n' "$long" >"$tmp/repo/docs/old.md"
printf '%s\n' "$long" >"$tmp/repo/notes.txt"
printf 'Short.\n' >"$tmp/repo/new.org"
git -C "$tmp/repo" add . && git -C "$tmp/repo" commit -q -m init

run
check "no input: the whole repository" 1 'docs/old.md:1:'
[[ "$out" == *notes.txt* ]] && {
  echo "FAIL a .txt file in a directory is checked"
  fail=1
} ||
  echo "ok   a .txt file in a directory is not checked"
check "the report directory is named after the path under HOME" 1 "report: $tmp/state/prose-cleanup/repo/"
check "a scan of the whole repository names its report -all" 1 $'-all.txt\n'
check "the report starts with the Emacs grep mode line" 1 $'\n-*- mode: grep -*-\nroot:   '"$tmp/repo"
check "the report rows have absolute paths" 1 "$tmp/repo/docs/old.md:1:"
check "the counts show a path relative to the root" 1 $' 1 docs/old.md\nper rule:'

run --all
check "--all: the whole repository, like no input" 1 'docs/old.md:1:'
check "an --all scan names its report -all" 1 $'-all.txt\n'

run --all docs
check "--all with paths stops the scan" 2 'give one scope'

run notes.txt
check "a named .txt file is checked" 1 'notes.txt:1:'
check "a scan of paths names its report -paths" 1 $'-paths.txt\n'

run --changed
check "--changed: no change, no alert" 0 ''
check "a --changed scan names its report -changed" 0 $'-changed.txt\n'
check "no alert still writes a report" 0 $'\nalerts: 0\n-*- mode: grep -*-'

printf '%s\n' "$long" >"$tmp/repo/new.org"
run --changed
check "--changed: only the changed file" 1 'new.org:1:'
[[ "$out" == *old.md* ]] && {
  echo "FAIL --changed checked an unchanged file"
  fail=1
} ||
  echo "ok   --changed leaves unchanged files out"

run --changed docs
check "--changed with paths stops the scan" 2 'give one scope'

run missing.md
check "a bad path stops the scan" 2 'no such file'

# A custom config with a warning-level rule: Vale exits 0 on it, scan.sh 1.
mkdir -p "$tmp/cfg/styles/Custom"
printf 'extends: existence\nmessage: "Avoid %%s."\nlevel: warning\ntokens: [Short]\n' \
  >"$tmp/cfg/styles/Custom/Short.yml"
printf 'StylesPath = styles\n[*.{md,org}]\nBasedOnStyles = Custom\n' >"$tmp/cfg/custom.ini"
printf 'Short.\n%s\n' "$long" >"$tmp/repo/new.org"
run --config "$tmp/cfg/custom.ini" new.org
check "--config: a warning counts as an alert" 1 'Custom.Short'
[[ "$out" == *Writing.* ]] && {
  echo "FAIL --config still ran the hook's rules"
  fail=1
} ||
  echo "ok   --config replaces the hook's rules"

run --config="$tmp/cfg/custom.ini" docs
check "--config: no match, no alert" 0 ''

run --changed --config "$tmp/cfg/custom.ini"
check "--config combines with --changed" 1 'new.org:1:'
check "a --config scan adds the config name to the report" 1 $'-changed-custom.txt\n'

cp -r "$tmp/cfg/styles" "$tmp/repo/styles"
cp "$tmp/cfg/custom.ini" "$tmp/repo/.vale.ini"
printf 'Short.\n' >"$tmp/repo/docs/short.md"
run --config .vale.ini docs
check "--config: a relative path, the repository's .vale.ini" 1 'short.md:1:'
check "the config name of .vale.ini has no leading dot" 1 $'-paths-vale.txt\n'

run --config missing.ini
check "a bad config stops the scan" 2 'no such config'

exit "$fail"
