#!/usr/bin/env bash
# Smoke test for hook.sh. Two groups: the edit matcher (one named file) and the
# Bash matcher (the .org paths the command text names). Run: bash test.sh
# Needs jq and emacs on PATH; without either the hook self-disables and the test
# would pass vacuously, so it skips loudly instead.
set -u

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hook.sh"
for bin in jq emacs git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "SKIP no $bin on PATH"; exit 0; }
done

# `timeout` turns a hung Emacs into a reported failure instead of a hung run.
hook() { timeout 60 bash "$HOOK"; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

# A table Org realigns: cells of unequal width, no padding yet.
unaligned() { printf '| a | bbbbbbbbbbbb |\n|---+---|\n| ccccccccccccccc | d |\n' > "$1"; }
# Aligned means the first cell is padded out to the width of the widest one.
aligned() {
  if grep -q '^| a  ' "$2"; then echo "ok   align  $1"; else echo "FAIL raw    $1"; fail=1; fi
}
untouched() {
  if grep -q '^| a | b' "$2"; then echo "ok   skip   $1"; else echo "FAIL touched $1"; fail=1; fi
}
edit_payload() { jq -nc --arg f "$1" '{tool_input:{file_path:$f}}'; }
bash_payload() { jq -nc --arg cwd "$1" --arg cmd "$2" '{cwd:$cwd,tool_input:{command:$cmd}}'; }

echo "== the edit matcher =="

unaligned "$tmp/edit.org"
edit_payload "$tmp/edit.org" | hook >/dev/null
aligned "the file the payload names" "$tmp/edit.org"

unaligned "$tmp/not-org.md"
edit_payload "$tmp/not-org.md" | hook >/dev/null
untouched "a file that is not .org" "$tmp/not-org.md"

if edit_payload "$tmp/missing.org" | hook >/dev/null; then
  echo "ok   exit   a file that does not exist"
else echo "FAIL exit   a file that does not exist"; fail=1; fi

# Idempotent: a second pass over the aligned file changes no byte.
before=$(cat "$tmp/edit.org")
edit_payload "$tmp/edit.org" | hook >/dev/null
if [[ "$before" == "$(cat "$tmp/edit.org")" ]]; then echo "ok   align  a second pass changes nothing"
else echo "FAIL align  a second pass changed the file"; fail=1; fi

# make-backup-files is off, so no file.org~ litter is left behind.
if [[ -z "$(find "$tmp" -name '*.org~')" ]]; then echo "ok   clean  no backup files left behind"
else echo "FAIL clean  a backup file was left behind"; fail=1; fi

# A | line inside a block is not a table, which org-at-table-p is what decides.
printf '#+begin_example\n| a | bbbbbbbbbbbb |\n| ccccccccccccccc | d |\n#+end_example\n' > "$tmp/block.org"
edit_payload "$tmp/block.org" | hook >/dev/null
untouched "a | line inside a block" "$tmp/block.org"

# Alignment only: a TBLFM formula is left unevaluated, the sum stays 0.
# shellcheck disable=SC2016  # $1 and $2 are Org column references
printf '| 2 | 3 | 0 |\n#+TBLFM: $3=$1+$2\n' > "$tmp/formula.org"
edit_payload "$tmp/formula.org" | hook >/dev/null
if grep -q '| *2 | *3 | *0 |' "$tmp/formula.org"; then echo "ok   align  a TBLFM formula is not evaluated"
else echo "FAIL align  the TBLFM formula was evaluated"; fail=1; fi

echo
echo "== the Bash matcher =="

repo=$tmp/repo
mkdir -p "$repo/docs" && git -C "$repo" init -q .
unaligned "$repo/docs/heredoc.org"
bash_payload "$repo" "cat > docs/heredoc.org <<'EOF'
| a | b |
EOF" | hook >/dev/null
aligned "a relative path, against the payload cwd" "$repo/docs/heredoc.org"

unaligned "$repo/one.org"
unaligned "$repo/two.org"
bash_payload "$repo" "sed -i '' s/x/y/ $repo/one.org && sed -i '' s/x/y/ $repo/two.org" | hook >/dev/null
aligned "the first of two files in one command" "$repo/one.org"
aligned "the second of two files in one command" "$repo/two.org"

unaligned "$repo/prose.md"
bash_payload "$repo" "printf x > $repo/prose.md" | hook >/dev/null
untouched "a command that names no .org path" "$repo/prose.md"

if bash_payload "$repo" "rm $repo/gone.org" | hook >/dev/null; then
  echo "ok   exit   a named path that does not exist"
else echo "FAIL exit   a named path that does not exist"; fail=1; fi

# Write and commit in one call: the commit holds the unaligned file, so the hook
# reports the working tree it just made dirty.
unaligned "$repo/committed.org"
git -C "$repo" add -A && git -C "$repo" commit -qm seed
notice=$(bash_payload "$repo" "cat > $repo/committed.org <<'EOF'
EOF
git commit -am docs" | hook)
aligned "a file the command committed" "$repo/committed.org"
if grep -q 'committed.org' <<<"$notice" && grep -q 'additionalContext' <<<"$notice"; then
  echo "ok   report the amend notice names the file"
else
  echo "FAIL report no amend notice: $notice"; fail=1
fi

# No `git commit` in the command text, so no notice, whatever the tree looks like.
unaligned "$repo/quiet.org"
notice=$(bash_payload "$repo" "cat > $repo/quiet.org <<'EOF'
EOF" | hook)
if [[ -z "$notice" ]]; then echo "ok   report no notice without a commit"
else echo "FAIL report unexpected notice: $notice"; fail=1; fi

echo
if [[ $fail -eq 0 ]]; then echo "all ok"; else echo "failures"; fi
exit "$fail"
