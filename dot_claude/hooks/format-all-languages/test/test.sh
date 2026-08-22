#!/usr/bin/env bash
# Smoke test for hook.sh. Two groups: the Bash-matcher sweep (which roots the
# queue reaches, and what it refuses to touch) and the edit matcher (which
# extensions dispatch where). Run: bash test.sh
# Needs jq and prettier on PATH; without either the hook self-disables and the
# test would pass vacuously, so it skips loudly instead.
set -u

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hook.sh"
for bin in jq prettier git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "SKIP no $bin on PATH"; exit 0; }
done

# Every invocation goes through here: `timeout` turns a runaway root queue into a
# reported failure instead of a hung test run.
hook() { timeout 30 bash "$HOOK"; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

# A table Prettier realigns: cells of unequal width, no padding yet.
unaligned() { printf '| a | bbbbbbbbbbbb |\n| --- | --- |\n| ccccccccccccccc | d |\n' > "$1"; }

# Fixture: outer repo, a plain subdir, an embedded repo, an embedded repo inside
# that one, and a submodule made dirty by an extra table row.
sub=$tmp/sub
mkdir -p "$sub" && git -C "$sub" init -q .
unaligned "$sub/SUB.md"
git -C "$sub" add -A && git -C "$sub" commit -qm seed

outer=$tmp/outer
mkdir -p "$outer/plain" "$outer/nested/deeper" && git -C "$outer" init -q .
git -C "$outer" commit -q --allow-empty -m seed
git -C "$outer" -c protocol.file.allow=always submodule add -q "$sub" submod
git -C "$outer" commit -qm submod
git -C "$outer/nested" init -q .
git -C "$outer/nested/deeper" init -q .
# A worktree inside the repo is the same case: the directory holds a `.git` file,
# so the parent lists it as one entry and its own toplevel is the worktree path.
git -C "$outer" worktree add -q "$outer/.worktrees/feat" -b feat
for f in OUTER.md plain/P.md nested/NESTED.md nested/deeper/DEEP.md .worktrees/feat/WT.md; do unaligned "$outer/$f"; done
printf '| a | bbbbbbbbbbbb |\n| --- | --- |\n| ccccccccccccccc | d |\n| e | f |\n' > "$outer/submod/SUB.md"

# Non-markdown the sweep must leave alone, gitignored markdown it must not see,
# and a symlink pointing back at a root, which the queue's membership check has
# to absorb rather than follow forever.
printf 'const a  =  1\n' > "$outer/code.ts"
printf '{"a":1,   "b":2}\n' > "$outer/data.json"
mkdir -p "$outer/vendor"
printf 'vendor/\n' > "$outer/.gitignore"
unaligned "$outer/vendor/V.md"
ln -s . "$outer/self"

# A table whose *padded* width passes 80 columns, plus a hard-wrapped paragraph.
# Prettier pads to the widest cell, so the cells have to be long: at the default
# print width this table collapses to the compact `| --- |` form, and without
# --prose-wrap never the paragraph keeps its line breaks.
{ printf '| %s | %s | %s |\n' first-column-heading-here second-column-heading-x third-column-heading-yz
  printf '| --- | --- | --- |\n'
  printf '| %s | %s | %s |\n' first-column-cell-value second-column-cell-value third-column-cell-value
  printf '\n'
  printf 'A paragraph the author hard-wrapped\nacross three short lines that the\nformatter has to join into one.\n'
} > "$outer/WIDE.md"

# Sweep with a command that names no path, so only the queue can find the roots.
# `timeout` is the assertion for the symlink cycle: `self` resolves back to a
# root already in the queue, which the membership check has to drop.
if jq -nc --arg cwd "$outer" '{cwd:$cwd,tool_input:{command:"echo x"}}' | hook; then
  echo "ok   exit   sweep terminates with a symlink back to a root"
else
  echo "FAIL hook exited non-zero or timed out"; fail=1
fi

formatted() { # formatted <label> <file>: the table is padded, so Prettier ran
  if grep -q '^| a  ' "$2"; then echo "ok   format $1"; else echo "FAIL raw    $1"; fail=1; fi
}
formatted "root"            "$outer/OUTER.md"
formatted "plain subdir"    "$outer/plain/P.md"
formatted "embedded repo"   "$outer/nested/NESTED.md"
formatted "embedded depth2" "$outer/nested/deeper/DEEP.md"
formatted "dirty submodule" "$outer/submod/SUB.md"
formatted "worktree in repo"  "$outer/.worktrees/feat/WT.md"

unchanged() { # unchanged <label> <file> <expected-content>: hook left it as written
  if [[ "$(cat "$2")" == "$3" ]]; then echo "ok   skip   $1"; else echo "FAIL touched $1"; fail=1; fi
}
# The sweep is markdown-only on purpose: reformatting every changed .ts/.json on
# every shell command would fight edits still in progress.
unchanged "sweep leaves .ts"    "$outer/code.ts"      'const a  =  1'
unchanged "sweep leaves .json"  "$outer/data.json"    '{"a":1,   "b":2}'
unchanged "gitignored markdown" "$outer/vendor/V.md"  "$(printf '| a | bbbbbbbbbbbb |\n| --- | --- |\n| ccccccccccccccc | d |')"

# The wide table proves the markdown --print-width: at Prettier's default 80 it would
# collapse to the compact `| --- |` form instead of staying padded.
if grep -q '^| --------' "$outer/WIDE.md"; then
  echo "ok   format wide table stays padded"
else
  echo "FAIL wide table compacted (print-width regression)"; fail=1
fi
if grep -q '^A paragraph the author hard-wrapped across three short lines that the formatter has to join into one\.$' "$outer/WIDE.md"; then
  echo "ok   format prose joined onto one line"
else
  echo "FAIL prose left hard-wrapped (--prose-wrap regression)"; fail=1
fi

# A repo with no commits has no HEAD, so `git diff HEAD` fails. Untracked
# markdown must still be swept, with no git error leaking out.
fresh=$tmp/fresh
mkdir -p "$fresh" && git -C "$fresh" init -q .
unaligned "$fresh/NEW.md"
err=$(jq -nc --arg cwd "$fresh" '{cwd:$cwd,tool_input:{command:"echo x"}}' | hook 2>&1)
formatted "repo with no HEAD" "$fresh/NEW.md"
[[ -z "$err" ]] && echo "ok   quiet  no-HEAD repo prints nothing" || { echo "FAIL noise  $err"; fail=1; }

# A cwd outside any repo must exit clean rather than error.
mkdir -p "$tmp/norepo"
if jq -nc --arg cwd "$tmp/norepo" '{cwd:$cwd,tool_input:{command:"echo x"}}' | hook; then
  echo "ok   exit   non-repo cwd"
else
  echo "FAIL exit   non-repo cwd"; fail=1
fi

# A markdown file in a second repo, reached only by an absolute path inside the
# command text, is the cross-repo case the root grep exists for.
other=$tmp/other
mkdir -p "$other" && git -C "$other" init -q .
git -C "$other" commit -q --allow-empty -m seed
unaligned "$other/OTHER.md"
jq -nc --arg cwd "$outer" --arg p "$other/OTHER.md" \
  '{cwd:$cwd,tool_input:{command:("cat > " + $p + " <<EOF\nx\nEOF")}}' | hook ||
  { echo "FAIL hook exited non-zero or timed out on the cross-repo sweep"; fail=1; }
formatted "cross-repo absolute path" "$other/OTHER.md"

# A command that writes and commits in one call leaves a clean tree, so the
# working-tree sweep finds nothing. With `git commit` in the command the sweep
# also covers the last commit, and reports that the commit needs amending.
committed=$tmp/committed
mkdir -p "$committed" && git -C "$committed" init -q .
git -C "$committed" commit -q --allow-empty -m seed
unaligned "$committed/C.md"
git -C "$committed" add -A && git -C "$committed" commit -qm docs
out=$(jq -nc --arg cwd "$committed" '{cwd:$cwd,tool_input:{command:"git add -A && git commit -m docs && git push"}}' | hook)
formatted "file committed in the same command" "$committed/C.md"
if jq -e '.hookSpecificOutput.additionalContext | test("amend")' >/dev/null 2>&1 <<<"$out"; then
  echo "ok   report amend hint after a commit sweep"
else
  echo "FAIL no amend hint after a commit sweep"; fail=1
fi

# The same sweep on a command that did not commit must stay silent, so an
# ordinary shell call never gets an amend hint.
unaligned "$committed/D.md"
out=$(jq -nc --arg cwd "$committed" '{cwd:$cwd,tool_input:{command:"echo x"}}' | hook)
[[ -z "$out" ]] && echo "ok   quiet  no hint without a commit" || { echo "FAIL hint without a commit"; fail=1; }

# --- Edit matcher: one named file, dispatched by extension ---
# The edit path formats every supported extension, not just markdown, and skips
# the rest. `.org` belongs to the format-org-tables hook, so this one must not
# touch it.
edit() { jq -nc --arg f "$1" '{tool_input:{file_path:$f}}' | hook; }

printf 'const a  =  1\n' > "$outer/edited.ts"
edit "$outer/edited.ts"
[[ "$(cat "$outer/edited.ts")" == 'const a = 1;' ]] &&
  echo "ok   format edit path formats .ts" ||
  { echo "FAIL edit path left .ts unformatted"; fail=1; }

printf '| a | bbbb |\n' > "$outer/notes.org"
edit "$outer/notes.org"
unchanged "edit path leaves .org" "$outer/notes.org" '| a | bbbb |'

printf 'x  =  1\n' > "$outer/script.py"
edit "$outer/script.py"
unchanged "edit path leaves .py" "$outer/script.py" 'x  =  1'

[[ $fail -eq 0 ]] && echo "all passed" || echo "failures"
exit $fail
