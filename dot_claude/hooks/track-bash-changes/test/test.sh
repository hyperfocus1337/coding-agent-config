#!/usr/bin/env bash
# Runs ../hook.sh around file changes in a scratch git repo and checks the log.
# Run: bash test.sh
set -u
hook="$(cd "$(dirname "$0")/.." && pwd)/hook.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
repo=$tmp/repo
log=$tmp/projects/p/s1/bash-changes.tsv
git init -q "$repo" && cd "$repo" || exit 1
printf 'a\n' >tracked.txt && printf 'b\n' >gone.txt
git add . && git -c user.name=t -c user.email=t@t commit -qm init

fail=0
# $1 = event, $2 = tool use id, $3 = cwd, $4 = transcript path
fire() {
  jq -n --arg e "$1" --arg t "$2" --arg c "$3" --arg p "$4" \
    '{hook_event_name: $e, session_id: "s1", tool_use_id: $t, cwd: $c, transcript_path: $p,
      tool_name: "Bash", tool_input: {command: "x"}}' | bash "$hook"
}
# $1 = tool use id, $2 = shell code that changes files, $3 = transcript path
call() {
  fire PreToolUse "$1" "$repo" "${3:-$tmp/projects/p/s1.jsonl}"
  eval "$2"
  fire PostToolUse "$1" "$repo" "${3:-$tmp/projects/p/s1.jsonl}"
}
# $1 = name, $2 = wanted log lines without the time column
check() {
  local got
  got=$(cut -f2- "$log" 2>/dev/null)
  if [[ $got == "$2" ]]; then echo "ok   $1"; else
    printf 'FAIL %s\n got:\n%s\n want:\n%s\n' "$1" "$got" "$2"; fail=1
  fi
}

# $1 = name, rest = test arguments
expect() {
  if test "${@:2}"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi
}

objects_before=$(fd -t f . "$repo/.git/objects" | wc -l)
call t1 'echo x >>tracked.txt; echo n >new.txt; rm gone.txt'
check "add, modify, delete" "$(printf 'D\t%s\nM\t%s\nA\t%s' "$repo/gone.txt" "$repo/tracked.txt" "$repo/new.txt" | sort -k2)"
: >"$log"
call t2 'echo y >>tracked.txt'
check "modify an already modified file" "$(printf 'M\t%s' "$repo/tracked.txt")"
: >"$log"
call t3 'true'
check "no change" ""
call t4 'echo z >>new.txt' "$tmp/projects/p/s1/subagents/agent-a.jsonl"
check "subagent writes to the session log" "$(printf 'M\t%s' "$repo/new.txt")"
: >"$log"
fire PreToolUse t5 "$repo" "$tmp/projects/p/s1.jsonl"
echo w >>tracked.txt
fire PostToolUseFailure t5 "$repo" "$tmp/projects/p/s1.jsonl"
check "failed call" "$(printf 'M\t%s' "$repo/tracked.txt")"
objects_after=$(fd -t f . "$repo/.git/objects" | wc -l)
expect "repo objects untouched" "$objects_before" -gt 0 -a "$objects_after" -eq "$objects_before"
expect "no pending snapshot left" -z "$(fd . "$tmp/projects/p/s1/bash-pending")"

# Only trees reach the session object directory, not file contents.
head -c 2000000 /dev/urandom >big.bin
: >"$log"
call t7 'echo v >>tracked.txt'
check "untracked file from before the call" "$(printf 'M\t%s' "$repo/tracked.txt")"
objects_kb=$(du -sk "$tmp/projects/p/s1/bash-objects" | cut -f1)
expect "file contents not stored" "$objects_kb" -lt 200

# Overlapping calls both see the change, and the shared index survives.
: >"$log"
fire PreToolUse p1 "$repo" "$tmp/projects/p/s1.jsonl"
fire PreToolUse p2 "$repo" "$tmp/projects/p/s1.jsonl"
echo q >>tracked.txt
fire PostToolUse p1 "$repo" "$tmp/projects/p/s1.jsonl"
fire PostToolUse p2 "$repo" "$tmp/projects/p/s1.jsonl"
check "parallel calls" "$(printf 'M\t%s\nM\t%s' "$repo/tracked.txt" "$repo/tracked.txt")"
expect "one index, no temporary copy" "$(fd . "$tmp/projects/p/s1/bash-index" | wc -l)" -eq 1

# The path keeps the symlink, and PostToolUse uses the repo of PreToolUse.
mkdir "$tmp/plain"
ln -s "$repo" "$tmp/link"
: >"$log"
fire PreToolUse l1 "$tmp/link" "$tmp/projects/p/s1.jsonl"
echo s >>tracked.txt
fire PostToolUse l1 "$tmp/plain" "$tmp/projects/p/s1.jsonl"
check "symlinked cwd, other cwd after" "$(printf 'M\t%s' "$tmp/link/tracked.txt")"

git init -q "$tmp/empty"
: >"$log"
fire PreToolUse e1 "$tmp/empty" "$tmp/projects/p/s1.jsonl"
echo e >"$tmp/empty/e.txt"
fire PostToolUse e1 "$tmp/empty" "$tmp/projects/p/s1.jsonl"
check "repo without commits" "$(printf 'A\t%s' "$tmp/empty/e.txt")"

fire PreToolUse t6 "$tmp/plain" "$tmp/projects/p/s2.jsonl"
expect "outside a repo" ! -e "$tmp/projects/p/s2"

if [ "$fail" -eq 0 ]; then echo "all pass"; else echo "FAILURES"; exit 1; fi
