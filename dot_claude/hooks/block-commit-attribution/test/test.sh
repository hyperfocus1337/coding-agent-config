#!/usr/bin/env bash
# Pipes Claude Code payloads into ../hook.sh and checks the exit code.
# Run: bash test.sh
set -u
hook="$(dirname "$0")/../hook.sh"

fail=0
# $1 = expected exit code, $2 = Bash command
check() {
  local got
  jq -n --arg c "$2" '{tool_name: "Bash", tool_input: {command: $c}}' | bash "$hook" >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$1" ]; then echo "ok   $1  $2"; else echo "FAIL $got (want $1)  $2"; fail=1; fi
}

# the trailer in a commit message, in every form the model writes it
check 2 "$(printf "git commit -F - <<'EOF'\nfix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF")"
check 2 "git commit -m 'fix: x' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'"
check 2 "git add a && git commit -m \"\$(printf 'fix\n\nCo-authored-by: Claude <noreply@anthropic.com>')\""
check 2 "git -C repo commit --amend -m 'x

co-authored-by: claude code'"

# no trailer, another co-author, or no commit
check 0 "git commit -m 'fix: x'"
check 0 "git commit -m 'fix: x' -m 'Co-Authored-By: Alice <alice@example.com>'"
check 0 "git log --grep='Co-Authored-By: Claude'"
check 0 "rg -n 'Co-Authored-By: Claude' ."
check 0 "rg -n 'co-authored-by: claude' committed.txt"

if [ "$fail" -eq 0 ]; then echo "all pass"; else echo "FAILURES"; exit 1; fi
