#!/usr/bin/env bash
# Shared scaffolding for test.sh and test-content.sh. Source it as the second
# line of each script; both stay independently runnable. It lives beside the
# scripts it serves and is not deployed, so it adds no runtime dependency to the
# hook itself.
#
# Sets: HOOK, tmp (with an EXIT trap), fail.
# Provides: mkrepo, hook, run, msg, runmsg, assert, contains, lacks, summary.

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/hook.sh"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

# Identity for every throwaway repo, so mkrepo needs no `git config` calls.
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

mkrepo() { # mkrepo <name> -> path to a repo with one seed commit
  local r="$tmp/$1"
  mkdir -p "$r"
  git -C "$r" init -q .
  echo seed > "$r/seed.txt"
  git -C "$r" add -A
  git -C "$r" commit -qm seed
  echo "$r"
}

payload() { # payload <command-text> -> a PreToolUse JSON payload
  # jq keeps a command containing a quote valid, which the -a cases in
  # test-content.sh rely on. test.sh's binary cases must run without jq, so fall
  # back to printf, which is correct for the quote-free commands they use.
  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}'
  else
    printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"
  fi
}

hook() { # hook <repo> <command-text> -> run the hook against that repo
  CLAUDE_PROJECT_DIR="$1" bash "$HOOK" <<< "$(payload "$2")"
}

run() { # run <repo> <command-text> -> hook exit code
  hook "$@" >/dev/null 2>&1
  echo $?
}

msg() { # msg <repo> <command-text> -> the block reason the hook writes to stderr
  { hook "$@" >/dev/null; } 2>&1 # drop stdout (the Cursor JSON), keep stderr
}

runmsg() { # runmsg <repo> <command-text> -> sets rc and out from ONE hook run
  # 2>&1 >/dev/null points stderr at the capture first, then stdout at null, so
  # out is stderr alone and rc is the hook's exit code. One run, both answers.
  # shellcheck disable=SC2034  # read by the sourcing script
  out=$(hook "$@" 2>&1 >/dev/null)
  # shellcheck disable=SC2034  # read by the sourcing script
  rc=$?
}

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

summary() { # print the tally and exit with the right code
  [ "$fail" -eq 0 ] && { echo "all pass"; exit 0; }
  echo "FAILURES"
  exit 1
}
