#!/usr/bin/env bash
# Blocks a `git commit` whose message carries a `Co-Authored-By: Claude`
# trailer. `attribution.commit: ""` in settings.json only stops Claude Code from
# adding the trailer; the model still writes it out of habit. A permission deny
# rule cannot catch it, because deny rules do not match a heredoc body.
set -u

# Same two-host contract as block-secret-commits: Cursor reads the JSON verdict,
# Claude Code reads the exit code.
allow() { printf '{"permission":"allow"}\n'; exit 0; }

shopt -s nocasematch # the model writes Co-Authored-By and Co-authored-by
trailer='co-authored-by:[[:space:]]*claude'

# Cheap filter on the raw payload first, so an ordinary call never spawns jq.
IFS= read -r -d '' payload
[[ $payload =~ $trailer ]] || allow

command_line=$(printf '%s' "$payload" | jq -r '.tool_input.command // .command // empty' 2>/dev/null) || allow
# `commit` as a whole word, so `git log --grep 'Co-Authored-By: Claude'` passes.
# shortcut: a message written to a file first and passed with `git commit -F
# <file>` passes too; a git commit-msg hook is the upgrade path.
[[ $command_line =~ (^|[^[:alnum:]_-])commit([^[:alnum:]_-]|$) ]] || allow
[[ $command_line =~ $trailer ]] || allow

msg='Blocked: remove the Co-Authored-By: Claude trailer from the commit message and run the commit again. The user does not want attribution lines in commits.'
echo "$msg" >&2
printf '{"permission":"deny","agent_message":"%s"}\n' "$msg"
exit 2
