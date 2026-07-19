#!/usr/bin/env bash
# Smoke test for hook.mjs — the markdown-table prettifier hook.
# Run: bash test.sh
# Drives the hook via stdin JSON payloads inside a throwaway git repo, since
# the hook is a self-executing script (can't be sourced like the bash hooks).
set -u

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hook.mjs"
fail=0
ok()   { echo "ok   $1"; }
bad()  { echo "FAIL $1"; fail=1; }

# A misaligned table; prettify pads "| A" out to the widest cell.
messy() { printf '%s\n' '| A | B |' '|---|---|' '| longvalue | y |' > "$1"; }
aligned() { grep -q '| A  ' "$1"; }  # header cell got padded → prettify ran

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
cd "$T" || exit 1
git init -q
git config user.email t@t.t
git config user.name t

# --- Write/Edit path: file_path names one md file ---
messy f.md
echo "{\"tool_input\":{\"file_path\":\"$T/f.md\"}}" | node "$HOOK"
aligned f.md && ok "file_path prettifies md" || bad "file_path prettifies md"

# --- file_path on a non-md file is a no-op ---
printf 'x=1\n' > f.txt
echo "{\"tool_input\":{\"file_path\":\"$T/f.txt\"}}" | node "$HOOK"
[ "$(cat f.txt)" = "x=1" ] && ok "non-md file_path untouched" || bad "non-md file_path untouched"

# --- Bash path: tracked file changed vs HEAD gets re-aligned ---
printf '%s\n' '| A         | B |' '| --------- | - |' '| longvalue | y |' > tracked.md
git add tracked.md && git commit -qm init
messy tracked.md  # now differs from the aligned committed copy
echo "{\"tool_name\":\"Bash\",\"cwd\":\"$T\"}" | node "$HOOK"
aligned tracked.md && ok "bash path fixes tracked change" || bad "bash path fixes tracked change"

# --- Bash path: untracked new md gets prettified ---
messy new.md
echo "{\"tool_name\":\"Bash\",\"cwd\":\"$T\"}" | node "$HOOK"
aligned new.md && ok "bash path fixes untracked md" || bad "bash path fixes untracked md"

# --- Bash path: cwd in a subdirectory still resolves the repo root ---
mkdir -p sub
messy sub/nested.md
echo "{\"tool_name\":\"Bash\",\"cwd\":\"$T/sub\"}" | node "$HOOK"
aligned sub/nested.md && ok "bash path works from subdir" || bad "bash path works from subdir"

# --- Bash path: gitignored md is skipped ---
echo 'ignored.md' > .gitignore
messy ignored.md
echo "{\"tool_name\":\"Bash\",\"cwd\":\"$T\"}" | node "$HOOK"
aligned ignored.md && bad "gitignored md skipped" || ok "gitignored md skipped"

# --- Malformed stdin exits cleanly ---
printf 'not json' | node "$HOOK" && ok "malformed stdin exits 0" || bad "malformed stdin exits 0"

# --- Bash path in a non-git dir exits cleanly ---
NG="$(mktemp -d)"
echo "{\"tool_name\":\"Bash\",\"cwd\":\"$NG\"}" | node "$HOOK" && ok "non-git dir exits 0" || bad "non-git dir exits 0"
rm -rf "$NG"

if [ "$fail" -eq 0 ]; then echo "all pass"; else echo "FAILURES"; exit 1; fi
