#!/bin/sh
# Runs command.ts for Claude Code and Codex, and blocks a `git commit` when
# command.ts cannot give a verdict: node is missing, too old to run a .ts
# file, or command.ts fails. Both agents block only on exit 2, so without
# this guard such a commit passes with no scan. Other commands pass.
#
# Run: sh guard.sh, with the hook payload on stdin.
payload=$(cat)
printf '%s' "$payload" |
  NODE_COMPILE_CACHE="$HOME/.cache/node-compile-cache" node "${0%/*}/command.ts"
status=$?
case $status in 0 | 2) exit "$status" ;; esac

# The same commit test as isCommit() in core.ts, on the raw JSON, where a
# newline in the command is the two characters \n.
case $payload in *git*) ;; *) exit 0 ;; esac
printf '%s' "$payload" |
  grep -Eq '([[:space:]]|\\[nrt])commit([^[:alnum:]_-]|$)' || exit 0

echo "Blocked: block-secret-commits could not scan this commit, because node is missing, older than 23.6, or failed (exit $status). Put node 23.6 or later on the PATH of the agent, then run the commit again." >&2
exit 2
