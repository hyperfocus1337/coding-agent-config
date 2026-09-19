#!/usr/bin/env bash
# Smoke test for hook.sh. Two groups: the edit matcher (one file named in the
# payload) and the Bash matcher (the paths the command text holds, gated on
# mtime). Run: bash test.sh
# Needs jq and shellcheck on PATH; without either the hook self-disables or the
# linter is skipped and the test would pass vacuously, so it skips loudly.
set -u

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hook.sh"
for bin in jq shellcheck; do
  command -v "$bin" >/dev/null 2>&1 || { echo "SKIP no $bin on PATH"; exit 0; }
done

# Not mktemp's default: the hook skips /tmp and $TMPDIR on purpose, so a fixture
# there would make every case pass vacuously.
tmp=$(mktemp -d "${HOME}/.lint-hook-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
fail=0

# A script shellcheck rejects at -S warning: SC2034 and SC2154.
bad() { printf '#!/usr/bin/env bash\nx=$1\necho $unquoted\n' > "$1"; }
clean() { printf '#!/usr/bin/env bash\necho hello\n' > "$1"; }

# Run the hook on a payload, capture stderr and the exit status.
run() { out=$(bash "$HOOK" <<<"$1" 2>&1); status=$?; }

check() { # name, expected status, expected substring in output ('' for none)
  if [[ "$status" -ne "$2" ]]; then
    echo "FAIL $1: exit $status, wanted $2"; fail=1; return
  fi
  if [[ -n "$3" && "$out" != *"$3"* ]]; then
    echo "FAIL $1: output does not hold '$3'"; fail=1; return
  fi
  echo "ok   $1"
}

edit_payload() { jq -nc --arg f "$1" '{hook_event_name:"PostToolUse",tool_input:{file_path:$f}}'; }
bash_payload() { jq -nc --arg cwd "$tmp" --arg c "$1" '{hook_event_name:"PostToolUse",cwd:$cwd,tool_input:{command:$c}}'; }

# --- Edit matcher ---
bad "$tmp/bad.sh"
run "$(edit_payload "$tmp/bad.sh")"
check "edit matcher blocks a file the linter rejects" 2 SC2154

clean "$tmp/clean.sh"
run "$(edit_payload "$tmp/clean.sh")"
check "edit matcher passes a clean file" 0 ''

run "$(edit_payload "$tmp/gone.sh")"
check "a file that does not exist is a clean skip" 0 ''

CLAUDE_LINT_DISABLE=all run "$(edit_payload "$tmp/bad.sh")"
check "CLAUDE_LINT_DISABLE=all turns the hook off" 0 ''

# --- Bash matcher ---
# The gap this group covers: a shell command writes a file, so no file_path is
# ever sent, and the file used to reach no linter at all.
bad "$tmp/written.sh"
run "$(bash_payload "cat > $tmp/written.sh <<'EOF' ... EOF")"
check "Bash matcher lints a file the command just wrote" 2 SC2154

run "$(bash_payload "cat $tmp/written.sh && bash $tmp/written.sh")"
check "the same file is linted once, not once per mention" 2 SC2154
# One finding per file, not one per mention. Count the finding itself, because
# the footer of each run repeats the code once more.
[[ $(grep -c 'SC2154 (warning)' <<<"$out") -eq 1 ]] \
  && echo "ok   one report per file" \
  || { echo "FAIL duplicate paths were not deduplicated"; fail=1; }

# A path the command only read keeps its old mtime, and blocking a read on an
# error that was already there helps nobody.
bad "$tmp/old.sh" && touch -t 202001010000 "$tmp/old.sh"
run "$(bash_payload "grep -n TODO $tmp/old.sh")"
check "a path the command only read is left alone" 0 ''

# Every target runs, so one command reports every file it wrote.
bad "$tmp/one.sh"
printf 'x=(\n' > "$tmp/two.sh"
run "$(bash_payload "touch $tmp/one.sh $tmp/two.sh")"
if [[ "$out" == *one.sh* && "$out" == *two.sh* ]]; then
  echo "ok   both files are reported, not just the first"
else
  echo "FAIL the pass stopped at the first failing file"; fail=1
fi

run "$(bash_payload "git status && ls -la")"
check "a command that names no source file is a clean skip" 0 ''

bad "/tmp/lint-hook-test-throwaway.sh"
run "$(bash_payload "cat > /tmp/lint-hook-test-throwaway.sh <<'EOF' ... EOF")"
check "a throwaway file under /tmp is skipped" 0 ''
rm -f /tmp/lint-hook-test-throwaway.sh

exit "$fail"
