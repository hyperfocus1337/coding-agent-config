#!/usr/bin/env bash
# End-to-end test for the betterleaks content scan in hook.sh.
# Run: bash test-content.sh
# Builds throwaway repos, pipes a hook payload into hook.sh, asserts the exit
# code: 0 = allowed, 2 = blocked. Skips if betterleaks is not installed.
set -u
HOOK="$(cd "$(dirname "$0")/.." && pwd)/hook.sh"

if ! command -v betterleaks >/dev/null 2>&1; then
  echo "skip: betterleaks not installed (hook fails open, nothing to test)"
  exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "skip: jq not installed (the content check requires it, so it fails open)"
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

mkrepo() { # mkrepo <name> -> path to a repo with one seed commit
  local r="$tmp/$1"
  mkdir -p "$r"
  git -C "$r" init -q .
  git -C "$r" config user.email test@example.com
  git -C "$r" config user.name test
  echo seed > "$r/seed.txt"
  git -C "$r" add -A
  git -C "$r" commit -qm seed
  echo "$r"
}

hook() { # hook <repo> <command-text> -> run the hook against that repo
  # jq builds the payload so a command containing quotes stays valid JSON. A
  # malformed payload would leave the hook with an empty command and silently
  # skip the -a test, which would pass the wrong cases.
  CLAUDE_PROJECT_DIR="$1" bash "$HOOK" \
    <<< "$(jq -nc --arg c "$2" '{tool_name:"Bash",tool_input:{command:$c}}')"
}

run() { # run <repo> <command-text> -> hook exit code
  hook "$@" >/dev/null 2>&1
  echo $?
}

msg() { # msg <repo> <command-text> -> the block reason the hook writes to stderr
  { hook "$@" >/dev/null; } 2>&1 # drop stdout (the Cursor JSON), keep stderr
}

# The fixture token is a random string shaped like a GitHub PAT. It matches no
# live account. betterleaks:allow keeps this file from blocking its own commit.
secret() { printf 'token = "ghp_9f3Kd82jSlqQm4Zx7VbNc1Rt6Yu0Ii5Oo3Pp"\n'; } # betterleaks:allow

assert() { # assert <expected-code> <actual-code> <label>
  if [ "$1" = "$2" ]; then echo "ok   $3"; else echo "FAIL $3 (want $1, got $2)"; fail=1; fi
}

contains() { # contains <needle> <haystack> <label>
  case "$2" in
    *"$1"*) echo "ok   $3" ;;
    *) echo "FAIL $3 (no '$1' in output)"; fail=1 ;;
  esac
}

lacks() { # lacks <needle> <haystack> <label>
  case "$2" in
    *"$1"*) echo "FAIL $3 (found '$1' in output)"; fail=1 ;;
    *) echo "ok   $3" ;;
  esac
}

# staged secret in an ordinary file → commit blocks
r=$(mkrepo leak)
secret > "$r/app.py"
git -C "$r" add -A
assert 2 "$(run "$r" 'git commit -m wip')" "block  staged secret on commit"

# same repo, same staged secret, but a `git add` must not block: at add time the
# scan is skipped, and the filename rules see nothing dangerous
assert 0 "$(run "$r" 'git add .')" "allow  staged secret on git add"

# the word "commit" inside a path must not read as the git subcommand. These are
# still `git add`, so the content scan has to stay off.
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

if [ "$fail" -eq 0 ]; then echo "all pass"; else echo "FAILURES"; exit 1; fi
