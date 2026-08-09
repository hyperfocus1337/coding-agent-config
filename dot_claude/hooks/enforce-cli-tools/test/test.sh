#!/usr/bin/env bash
# Smoke test for the violation matcher in hook.sh.
# Run: bash test.sh   (sourcing hook.sh stops at the guard, so only the
# functions load — no stdin read, no payload parsing).
# shellcheck disable=SC2317  # sourced guard confuses reachability analysis
# shellcheck disable=SC1091  # source path resolves at runtime, not lint time
# shellcheck disable=SC2016  # literal $( and backticks below are test fixtures
set -u
# shellcheck source=../hook.sh
source "$(dirname "$0")/../hook.sh"

fail=0
blocked() { if violation "$1" >/dev/null; then echo "ok   block  $1"; else echo "FAIL allow  $1"; fail=1; fi; }
allowed() { if violation "$1" >/dev/null; then echo "FAIL block  $1"; fail=1; else echo "ok   allow  $1"; fi; }
maps() { if [ "$(violation "$2")" = "$1" ]; then echo "ok   maps   $2 -> $1"; else echo "FAIL maps   $2 -> $1"; fail=1; fi; }

# the shipped rules file parsed whole (a missing trailing newline would silently
# drop the last rule, which is enforcement disappearing with no error anywhere)
if [ ${#rule_tool[@]} -eq 2 ]; then echo "ok   rules  2 parsed"; else echo "FAIL rules  ${#rule_tool[@]} parsed, expected 2"; fail=1; fi

# banned tool in command position → must block
blocked "npm i"
blocked "sudo npm ci"
blocked "CI=1 npm run build"
blocked "timeout 30 npm ci"
blocked "/usr/local/bin/npm i"
blocked "cd web && yarn add lodash"
blocked "yarn"
blocked "(cd web && npm i)"     # subshell
blocked "{ npm i; }"            # group: the brace is punctuation, not a command
blocked 'echo $(npm bin)'       # command substitution, even as an argument
blocked 'echo `npm bin`'        # backtick substitution, even as an argument
blocked 'PATH=$(npm bin):$PATH' # substitution inside an assignment
blocked "$(printf 'cd x\nnpm i')" # second line of a multi-line command

# banned name as an argument or as text → must allow
allowed "pnpm i"
allowed "rg npm"
allowed "git commit -m 'switch to npm'"
allowed "cat package-lock.json"
allowed "npmrc-check"

# a separator inside a quoted string must not start a segment
allowed "git commit -m 'fix; npm bump'"
allowed 'echo "a && npm i"'

# the replacement comes back with the banned name, multi-word replacements intact
maps "npm pnpm" "npm i"
rule_tool+=(npx) && rule_replacement+=("pnpm dlx")
maps "npx pnpm dlx" "npx create-vite app"

# allowlisted tool → must allow again (is_allowed short-circuits the rule)
# shellcheck disable=SC2034  # read by is_allowed in the sourced hook.sh
allowlist=(npm)
allowed "npm i"
blocked "yarn add lodash" # only the named tool is exempt, not the whole hook

if [ "$fail" -eq 0 ]; then echo "all pass"; else echo "FAILURES"; exit 1; fi
