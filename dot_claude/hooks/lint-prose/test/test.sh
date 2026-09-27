#!/usr/bin/env bash
# Smoke test for hook.sh: the paragraph rule in Markdown, Org, and HTML, the
# Edit-only check, the Bash matcher, and the skips. Run: bash test.sh
# Needs jq and vale on PATH; without either the hook self-disables and the test
# would pass vacuously, so it skips loudly.
set -u

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hook.sh"
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
# An Edit: the file plus the text the edit wrote.
patch_payload() { jq -nc --arg f "$1" --arg s "$2" '{hook_event_name:"PostToolUse",tool_input:{file_path:$f,new_string:$s}}'; }
bash_payload() { jq -nc --arg cwd "$tmp" --arg c "$1" '{hook_event_name:"PostToolUse",cwd:$cwd,tool_input:{command:$c}}'; }

long='One. Two. Three. Four. Five. Six. Seven, the last sentence here.'

# --- Markdown ---
printf '# Title\n\n%s\n\nOne. Two. Three. Four. Five. Six.\n' "$long" > "$tmp/long.md"
run "$(edit_payload "$tmp/long.md")"
check "Write blocks a paragraph over 6 sentences" 2 'long.md:3:'
[[ "$out" == *'long.md:5:'* ]] && { echo "FAIL 6 sentences are allowed"; fail=1; } || echo "ok   6 sentences are allowed"

run "$(patch_payload "$tmp/long.md" 'A short paragraph that an edit wrote.')"
check "an Edit is not blocked by an old long paragraph elsewhere" 0 ''

run "$(patch_payload "$tmp/long.md" "$long")"
check "an Edit that writes a long paragraph is blocked" 2 'ParagraphLength'

printf -- '- %s\n- Short item.\n' "$long" > "$tmp/item.md"
run "$(edit_payload "$tmp/item.md")"
check "a list item over 6 sentences is blocked" 2 'item.md:1:'

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

run "$(patch_payload "$tmp/long.org" "- $long")"
check "Org: an Edit that writes a long list item is blocked" 2 'ParagraphLength'

# --- HTML ---
printf '<html><head><script>a. b. c. d. e. f. g.</script></head>\n<body><pre>%s</pre>\n<p>Short.</p></body></html>\n' "$long" > "$tmp/ok.html"
run "$(edit_payload "$tmp/ok.html")"
check "HTML: script and pre are not counted" 0 ''

run "$(patch_payload "$tmp/ok.html" "<p>$long</p>")"
check "HTML: an Edit that writes a long paragraph is blocked" 2 'ParagraphLength'

# --- Bash matcher ---
run "$(bash_payload "cat > $tmp/long.md <<'EOF' ... EOF")"
check "Bash matcher checks a file the command just wrote" 2 'long.md:3:'

touch -t 202001010000 "$tmp/item.md"
run "$(bash_payload "cat $tmp/item.md")"
check "a path the command only read is left alone" 0 ''

# --- Skips ---
printf '%s\n' "$long" > "$tmp/notes.txt"
run "$(edit_payload "$tmp/notes.txt")"
check "a file that is not Markdown, Org, or HTML is skipped" 0 ''

CLAUDE_LINT_DISABLE=prose run "$(edit_payload "$tmp/long.md")"
check "CLAUDE_LINT_DISABLE=prose turns the hook off" 0 ''

CLAUDE_LINT_DISABLE=yaml,all run "$(edit_payload "$tmp/long.md")"
check "CLAUDE_LINT_DISABLE=all turns the hook off" 0 ''

printf '%s\n' "$long" > /tmp/lint-prose-test-throwaway.md
run "$(edit_payload /tmp/lint-prose-test-throwaway.md)"
check "a throwaway file under /tmp is skipped" 0 ''
rm -f /tmp/lint-prose-test-throwaway.md

exit "$fail"
