#!/usr/bin/env bash
# Smoke test for hook.sh: the paragraph rule in each format, the Bash matcher,
# the changed-paragraph filter, a Vale failure, and the skips. Run: bash test.sh
# Needs jq and vale on PATH; without either the hook self-disables and the test
# would pass vacuously, so it skips loudly.
set -u

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hook.sh"
# The Vale config in the chezmoi source, not the applied copy in ~/.config.
LINT_PROSE_VALE_DIR="$(cd "${HOOK%/*}/../../../dot_config/vale" && pwd)"
export LINT_PROSE_VALE_DIR
for bin in jq vale; do
  command -v "$bin" >/dev/null 2>&1 || { echo "SKIP no $bin on PATH"; exit 0; }
done

# Not mktemp's default: the hook skips /tmp and $TMPDIR on purpose, so a fixture
# there would make every case pass vacuously.
tmp=$(mktemp -d "${HOME}/.lint-prose-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
fail=0

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

long='One. Two. Three. Four. Five. Six, the last sentence here.'

# --- Markdown ---
printf '# Title\n\n%s\n\nOne. Two. Three. Four. Five.\n' "$long" > "$tmp/long.md"
run "$(edit_payload "$tmp/long.md")"
check "Write blocks a paragraph over 5 sentences" 2 'long.md:3:'
[[ "$out" == *'long.md:5:'* ]] && { echo "FAIL 5 sentences are allowed"; fail=1; } || echo "ok   5 sentences are allowed"

printf -- '- %s\n- Short item.\n' "$long" > "$tmp/item.md"
run "$(edit_payload "$tmp/item.md")"
check "a list item over 5 sentences is blocked" 2 'item.md:1:'

printf -- '---\nargument-hint: [a | b]\ndescription: %s\n---\n\n```\n%s\n```\n\nUse `a.b. c.d. e.f. g.h.` here, e.g. this. Or i.e. that. Three. Four. Five.\n' "$long" "$long" > "$tmp/skip.md"
run "$(edit_payload "$tmp/skip.md")"
check "invalid frontmatter, code, and abbreviations are not counted" 0 ''

# --- Org ---
printf '#+title: A [b] {c}\n\n* A. B. C. D. E. F. G.\n\n%s\n\n#+begin_src sh\n%s\n#+end_src\n' "$long" "$long" > "$tmp/long.org"
run "$(edit_payload "$tmp/long.org")"
check "Org: a long paragraph is blocked" 2 'long.org:5:'
[[ $(grep -c ParagraphLength <<<"$out") -eq 1 ]] \
  && echo "ok   Org: keywords, headings, and src blocks are not counted" \
  || { echo "FAIL Org: counted text outside the paragraph"; fail=1; }

# --- HTML ---
printf '<html><head><script>a. b. c. d. e. f. g.</script></head>\n<body><pre>%s</pre>\n<p>Short.</p></body></html>\n' "$long" > "$tmp/ok.html"
run "$(edit_payload "$tmp/ok.html")"
check "HTML: script and pre are not counted" 0 ''

# --- Plain text ---
printf '%s\n\nShort.\n' "$long" > "$tmp/notes.txt"
run "$(edit_payload "$tmp/notes.txt")"
check "plain text: a long paragraph is blocked" 2 'notes.txt:1:'

run "$(bash_payload "make test > $tmp/notes.txt")"
check "plain text: a .txt file a Bash command wrote is left alone" 0 ''

# --- Bash matcher ---
run "$(bash_payload "cat > $tmp/long.md <<'EOF' ... EOF")"
check "Bash matcher checks a file the command just wrote" 2 'long.md:3:'

touch -t 202001010000 "$tmp/item.md"
run "$(bash_payload "cat $tmp/item.md")"
check "a path the command only read is left alone" 0 ''

# --- Only the changed paragraphs (a git repo) ---
repo=$tmp/repo
git init -q "$repo"
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
# An old long paragraph over two lines, then a short one.
printf '%s\nStill the old paragraph.\n\nShort.\n' "$long" > "$repo/old.md"
git -C "$repo" add old.md && git -C "$repo" commit -q -m old

printf '%s\nStill the old paragraph.\n\nShort, and changed.\n' "$long" > "$repo/old.md"
run "$(edit_payload "$repo/old.md")"
check "an old long paragraph that did not change is not reported" 0 ''

printf '%s\nThe old paragraph, changed on its second line.\n\nShort.\n' "$long" > "$repo/old.md"
run "$(edit_payload "$repo/old.md")"
check "a change on a later line of a long paragraph reports it" 2 'old.md:1:'

git -C "$repo" checkout -q -- old.md
printf 'One. Two. Three. Four. Five.\n' > "$repo/five.md"
git -C "$repo" add five.md && git -C "$repo" commit -q -m five
printf 'One. Two. Three. Four. Five. Six.\n' > "$repo/five.md"
run "$(jq -nc --arg f "$repo/five.md" '{hook_event_name:"PostToolUse",tool_input:{file_path:$f,old_string:"Five.",new_string:"Five. Six."}}')"
check "an Edit that adds a 6th sentence to a paragraph is blocked" 2 'five.md:1:'

printf '%s\n' "$long" > "$repo/new.md"
run "$(bash_payload "cat > $repo/new.md <<'EOF' ... EOF")"
check "an untracked file is checked whole" 2 'new.md:1:'

git -C "$repo" add new.md && git -C "$repo" commit -q -m new
run "$(bash_payload "cat > $repo/new.md <<'EOF' ... EOF && git commit -am new")"
check "a write and commit in one command is compared to HEAD~1" 2 'new.md:1:'

# --- A Vale failure does not block ---
# A copy of the Vale config with a rule Vale cannot load.
cp -R "$LINT_PROSE_VALE_DIR" "$tmp/broken"
echo 'extends: nonsense' > "$tmp/broken/styles/Writing/ParagraphLength.yml"
LINT_PROSE_VALE_DIR=$tmp/broken run "$(edit_payload "$tmp/long.md")"
check "a broken rule is reported to the user, not blocked" 1 'Vale failed'

# --- Skips ---
printf '%s\n' "$long" > "$tmp/notes.log"
run "$(edit_payload "$tmp/notes.log")"
check "a file that is not prose is skipped" 0 ''

CLAUDE_LINT_DISABLE=prose run "$(edit_payload "$tmp/long.md")"
check "CLAUDE_LINT_DISABLE=prose turns the hook off" 0 ''

CLAUDE_LINT_DISABLE=yaml,all run "$(edit_payload "$tmp/long.md")"
check "CLAUDE_LINT_DISABLE=all turns the hook off" 0 ''

# A mise shim with no version set: on PATH, but it fails when run.
mkdir -p "$tmp/bin"
printf '#!/bin/sh\necho "mise ERROR No version is set for shim: vale" >&2\nexit 1\n' > "$tmp/bin/vale"
chmod +x "$tmp/bin/vale"
PATH="$tmp/bin:$PATH" run "$(edit_payload "$tmp/long.md")"
check "a vale shim that cannot run is skipped" 0 ''

printf '%s\n' "$long" > /tmp/lint-prose-test-throwaway.md
run "$(edit_payload /tmp/lint-prose-test-throwaway.md)"
check "a throwaway file under /tmp is skipped" 0 ''
rm -f /tmp/lint-prose-test-throwaway.md

exit "$fail"
