#!/usr/bin/env bash
# Test for modify_hooks.json: runs the chezmoi modify script with a fake HOME and
# a current hooks.json on stdin. Run: bash modify-hooks-json.sh
set -u

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/modify_hooks.json"
command -v jq >/dev/null 2>&1 || { echo "SKIP no jq on PATH"; exit 0; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

# A current file as cmux writes it, plus a stale hook that the repo dropped.
current='{"hooks":{
  "Stop":[{"hooks":[{"type":"command","command":"/Users/x/.cmux/hooks/cmux-codex-hook-a96f030eb871aa5f-persistent-stop.sh","timeout":5}]}],
  "PermissionRequest":[{"hooks":[{"type":"command","command":"'"'"'/Users/x y/.cmux/hooks/cmux-codex-hook-93a95cbd1c49741c-persistent-feed-PermissionRequest.sh'"'"'","timeout":120}]}],
  "PreToolUse":[{"hooks":[{"type":"command","command":"bash old.sh"}]}]
}}'

check() { # name, jq expression that must be true
  if jq -e "$2" "$tmp/out" >/dev/null; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi
}

mkdir -p "$tmp/host/.cmux/hooks" "$tmp/container"

printf '%s' "$current" | HOME=$tmp/host sh "$SCRIPT" >"$tmp/out"
check "host keeps cmux Stop group after repo Stop group" \
  '.hooks.Stop | length == 2 and (.[1].hooks[0].command | test("persistent-stop"))'
check "host keeps quoted cmux path" '.hooks.PermissionRequest | length == 1'
check "host drops stale non-cmux hook" '[.. | .command? // empty] | index("bash old.sh") == null'

printf '%s' "$current" | HOME=$tmp/container sh "$SCRIPT" >"$tmp/out"
check "container drops cmux hooks" '[.. | .command? // empty | select(test("cmux"))] == []'
check "container keeps repo hooks" '.hooks.Stop | length == 1'

HOME=$tmp/host sh "$SCRIPT" </dev/null >"$tmp/out"
check "empty stdin gives repo hooks" '.hooks | keys == ["PostToolUse","PreToolUse","SessionStart","Stop"]'

exit "$fail"
