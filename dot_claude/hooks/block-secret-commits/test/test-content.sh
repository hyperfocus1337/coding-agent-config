#!/usr/bin/env bash
# End-to-end test for the betterleaks content scan in hook.sh, the scan_content
# function that blocks a secret value pasted into an ordinary file.
#
# Run: bash test-content.sh
# Builds throwaway repos, pipes a hook payload into hook.sh, asserts the exit
# code: 0 = allowed, 2 = blocked. Skips if betterleaks or jq is missing.
# shellcheck source=helpers.sh
# shellcheck disable=SC1091  # the source path is built at runtime
# shellcheck disable=SC2034  # fail is read by summary in helpers.sh
# shellcheck disable=SC2154  # tmp is set by helpers.sh
set -u
source "$(dirname "${BASH_SOURCE[0]}")/helpers.sh"

if ! command -v betterleaks >/dev/null 2>&1; then
  echo "skip: betterleaks not installed (hook fails open, nothing to test)"
  exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "skip: jq not installed (the content check requires it, so it fails open)"
  exit 0
fi

secret() { printf 'token = "ghp_9f3Kd82jSlqQm4Zx7VbNc1Rt6Yu0Ii5Oo3Pp"\n'; } # betterleaks:allow




# staged secret in an ordinary file → commit blocks
r=$(mkrepo leak)
secret > "$r/app.py"
git -C "$r" add -A
assert 2 "$(run "$r" 'git commit -m wip')" "block  staged secret on commit"

# same repo, same staged secret, but a `git add` must not block: the hook
# triggers on `git commit` alone, so an add never reaches a scan
assert 0 "$(run "$r" 'git add .')" "allow  staged secret on git add"

# the word "commit" inside a path must not read as the git subcommand, or the
# scan would run against an index the command has not written yet
assert 0 "$(run "$r" 'git add hooks/block-secret-commits/test')" "allow  'commits' in an added path"
assert 0 "$(run "$r" 'git add .git/hooks/commit-msg')" "allow  'commit-msg' in an added path"

# the real subcommand must still register through an intervening flag
assert 2 "$(run "$r" 'git -C . commit -m wip')" "block  commit behind a git flag"

# clean staged content → commit allowed
r=$(mkrepo clean)
printf 'def main():\n    print("hello")\n' > "$r/app.py"
git -C "$r" add -A
assert 0 "$(run "$r" 'git commit -m wip')" "allow  clean staged content"

# nothing staged → nothing to find → allowed
r=$(mkrepo empty)
assert 0 "$(run "$r" 'git commit -m wip')" "allow  empty stage"

# unstaged secret → not committable yet → allowed
r=$(mkrepo unstaged)
secret > "$r/app.py"
assert 0 "$(run "$r" 'git commit -m wip')" "allow  unstaged secret"

# not a git repo → scanner errors → fail open
mkdir -p "$tmp/norepo"
assert 0 "$(run "$tmp/norepo" 'git commit -m wip')" "allow  non-repo (fails open)"

# unrelated command → never reaches the scan
r=$(mkrepo other)
secret > "$r/app.py"
git -C "$r" add -A
assert 0 "$(run "$r" 'ls -la')" "allow  unrelated command"

# --- the block message must name the finding, not just exit 2 ---
# Exit codes alone cannot see a broken report filter, so assert the text too.

r=$(mkrepo message)
secret > "$r/app.py"
git -C "$r" add -A
out=$(msg "$r" 'git commit -m wip')
contains "github-pat in app.py:1" "$out" "msg    names rule, file and line"
contains "fingerprint: app.py:github-pat:1" "$out" "msg    gives the .betterleaksignore entry"
lacks "jq: error" "$out" "msg    jq formatted the report cleanly"

# --- git commit -a: stages tracked edits after the hook runs ---

mkdirty() { # mkdirty <name> -> repo whose tracked app.py holds an unstaged secret
  local r
  r=$(mkrepo "$1")
  echo 'token = "placeholder"' > "$r/app.py"
  git -C "$r" add -A
  git -C "$r" commit -qm "add app"
  secret > "$r/app.py" # tracked, modified, deliberately left unstaged
  echo "$r"
}

r=$(mkdirty dash-a)
assert 2 "$(run "$r" 'git commit -am wip')" "block  -am on a tracked edit"
assert 2 "$(run "$r" 'git commit -a -m wip')" "block  -a -m on a tracked edit"
assert 2 "$(run "$r" 'git commit --all -m wip')" "block  --all on a tracked edit"
assert 2 "$(run "$r" 'git commit -a')" "block  bare -a on a tracked edit"

# without -a the same edit is not part of the commit, so it must not block. The
# message text mentioning -a must not be mistaken for the flag.
assert 0 "$(run "$r" 'git commit -m wip')" "allow  no -a, edit stays unstaged"
assert 0 "$(run "$r" 'git commit -m "add -a flag"')" "allow  -a only inside the message"
assert 0 "$(run "$r" 'git commit --allow-empty -m wip')" "allow  --allow-empty is not --all"

# --- allowlist: .claude-allow-secrets exempts a file from both checks ---

r=$(mkrepo allowed-path)
mkdir -p "$r/config"
secret > "$r/config/prod.env"
echo "config/prod.env" > "$r/.claude-allow-secrets"
git -C "$r" add -A -f
assert 0 "$(run "$r" 'git commit -m wip')" "allow  allowlisted by path"

r=$(mkrepo allowed-base)
mkdir -p "$r/config"
secret > "$r/config/prod.env"
echo "prod.env" > "$r/.claude-allow-secrets" # bare basename
git -C "$r" add -A -f
assert 0 "$(run "$r" 'git commit -m wip')" "allow  allowlisted by basename"

r=$(mkrepo allowed-env)
secret > "$r/app.py"
git -C "$r" add -A
CLAUDE_ALLOW_SECRETS=app.py
export CLAUDE_ALLOW_SECRETS
assert 0 "$(run "$r" 'git commit -m wip')" "allow  allowlisted by CLAUDE_ALLOW_SECRETS"
unset CLAUDE_ALLOW_SECRETS

# one file exempted must not exempt the others
r=$(mkrepo allowed-partial)
mkdir -p "$r/config"
secret > "$r/config/prod.env"
secret > "$r/app.py"
echo "config/prod.env" > "$r/.claude-allow-secrets"
git -C "$r" add -A -f
assert 2 "$(run "$r" 'git commit -m wip')" "block  second file not allowlisted"

summary
