#!/usr/bin/env bash
# Smoke test for apply-patch.sh. A stub hook stands in for the Claude hooks: it
# logs the file_path it gets and exits with the code named in the file's
# content. Run: bash test.sh
# Needs jq on PATH; without it the wrapper finds no paths and every case fails.
set -u

WRAPPER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apply-patch.sh"
command -v jq >/dev/null 2>&1 || { echo "SKIP no jq on PATH"; exit 0; }

# Not mktemp's default, to match the hook tests: the Claude hooks skip /tmp.
tmp=$(mktemp -d "${HOME}/.apply-patch-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
log=$tmp/log
fail=0

cat >"$tmp/stub.sh" <<'EOF'
payload=$(cat)
f=$(jq -r '.tool_input.file_path' <<<"$payload")
printf '%s %s\n' "$(jq -r '.tool_name' <<<"$payload")" "$f" >>"$LOG"
code=$(cat "$f")
exit "${code:-0}"
EOF

# Run the wrapper on a patch with cwd=$tmp, capture the exit status.
run() {
  : >"$log"
  jq -nc --arg cwd "$tmp" --arg c "$1" \
    '{hook_event_name:"PostToolUse",cwd:$cwd,tool_name:"apply_patch",tool_input:{command:$c}}' |
    LOG=$log bash "$WRAPPER" "$tmp/stub.sh" 2>/dev/null
  status=$?
}

check() { # name, expected status, expected log (sorted lines)
  if [[ "$status" -ne "$2" ]]; then
    echo "FAIL $1: exit $status, wanted $2"; fail=1; return
  fi
  if [[ "$(sort "$log")" != "$3" ]]; then
    printf 'FAIL %s: log\n%s\nwanted\n%s\n' "$1" "$(sort "$log")" "$3"; fail=1; return
  fi
  echo "ok   $1"
}

# Add, Update, Delete, and Update with Move to; one relative path with a space.
mkdir -p "$tmp/sub dir"
echo 0 >"$tmp/added.md"
echo 0 >"$tmp/sub dir/updated.md"
echo 0 >"$tmp/moved.md"
run "*** Begin Patch
*** Add File: added.md
+0
*** Update File: sub dir/updated.md
@@
-x
+0
*** Delete File: $tmp/deleted.md
*** Update File: $tmp/old.md
*** Move to: $tmp/moved.md
@@
-x
+0
*** End Patch"
check "one Write per written file, deleted and old side skipped" 0 "Write $tmp/added.md
Write $tmp/moved.md
Write $tmp/sub dir/updated.md"

# A block on one file beats a crash on another.
echo 2 >"$tmp/a.md"
echo 127 >"$tmp/b.md"
run "*** Add File: a.md
*** Add File: b.md"
check "exit 2 wins over a higher code" 2 "Write $tmp/a.md
Write $tmp/b.md"

echo 1 >"$tmp/a.md"
echo 0 >"$tmp/b.md"
run "*** Add File: a.md
*** Add File: b.md"
check "highest code wins without a block" 1 "Write $tmp/a.md
Write $tmp/b.md"

run "not a patch"
check "no file lines, no hook run" 0 ""

bash "$WRAPPER" </dev/null >/dev/null 2>&1
status=$?
: >"$log"
check "missing hook argument fails" 1 ""

exit "$fail"
