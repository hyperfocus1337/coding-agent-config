#!/usr/bin/env bash
# Canary for the code mode support of format-code. Runs one real interactive Claude Code session in
# code mode through nested-claude.py, with the deployed ~/.claude settings and hooks, and checks:
#   1. each call inside a REPL block has a tool_use_id that starts with repl_ (undocumented),
#   2. an edit after a write in the same block does not fail, because the format waits for the
#      block end,
#   3. the file ends formatted, with the last edit in it.
# Run it after a Claude Code upgrade. It spends tokens and takes about 30 s.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Under the home directory, because format-code skips files under /tmp. Two levels deep, because
# dcg blocks an mv of a path right below the home directory.
dir="$HOME/.cache/hooks-e2e/$(date +%s)"
mkdir -p "$dir"
git -C "$dir" init -q
git -C "$dir" -c user.name=example -c user.email=example@example.com commit -q --allow-empty -m init

prompt='This is a hook test. Do exactly this, without reading files and without other commands:
First, write one code block that creates a.ts with the file write function, content: const  a = {b:1}   and then, in the same block, uses the file edit function on a.ts to change the exact text "const  a = {b:1}" to "const  a = {b:2}".
After that block returns, write a second code block that uses the file edit function on a.ts to change b:2 to b:3. Base the old text on what you know of the current content of the file. Do not retry if it fails; report the error.
Then reply with the single word done.'

echo "==> code mode session in $dir"
result="$(RAW="$dir.pty.log" python3 -I "$HERE/nested-claude.py" "$dir" "$prompt")"
transcript="$(jq -r .transcript <<<"$result")"
fail() {
  echo "FAIL: $1" >&2
  echo "Kept for inspection: $dir, $dir.pty.log, $transcript" >&2
  exit 1
}
[[ $(jq -r .done <<<"$result") == true ]] || fail "the session did not end its turn: $result"
grep -q '"tool_use_id":"repl_' "$transcript" ||
  fail "no tool_use_id starts with repl_: format-code now formats each call inside a block"
! grep -q 'modified since read' "$transcript" || fail "an edit inside a block failed after a format"
[[ -f $dir/a.ts && $(<"$dir/a.ts") =~ b:[[:space:]]*3 ]] || fail "a.ts lacks the last edit"
(cd "$dir" && oxfmt --check a.ts >/dev/null 2>&1) || fail "a.ts is not formatted: $(<"$dir/a.ts")"

rm -rf "$dir" "$dir.pty.log" "${transcript%.jsonl}" "$transcript"
echo "all pass"
