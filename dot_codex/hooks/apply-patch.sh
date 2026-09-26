#!/usr/bin/env bash
# ~/.codex/hooks/apply-patch.sh <hook script>
#
# Runs a Claude Code file hook once per file that a Codex apply_patch call wrote.
# Codex edits files through apply_patch, so its PostToolUse payload carries the
# patch text in tool_input.command and no tool_input.file_path. The Claude hooks
# then take their Bash branch, which formats markdown only. This wrapper sends
# each hook a Write payload per file instead, so the hook takes its single-file
# branch, as it does under Claude Code.

hook=${1:?usage: apply-patch.sh <hook script>}
payload=$(cat)
cwd=$(jq -r '.cwd // empty' <<<"$payload")
[[ -n "$cwd" ]] || cwd=$PWD

# Exit 2 wins, because only 2 blocks and reaches the model. Otherwise the
# highest code wins, so a crash (126, 127) still shows as a warning.
status=0
blocked=''
while IFS= read -r path; do
  [[ "$path" == /* ]] || path=$cwd/$path
  # A deleted file, or the old side of a move, has nothing to format.
  [[ -f "$path" ]] || continue
  jq -c --arg f "$path" '.tool_name = "Write" | .tool_input = {file_path: $f}' <<<"$payload" | bash "$hook"
  rc=$?
  ((rc == 2)) && blocked=1
  ((rc > status)) && status=$rc
done < <(jq -r '.tool_input.command // empty' <<<"$payload" |
  sed -nE 's/^\*\*\* (Add File|Update File|Move to): (.+)$/\2/p' | sort -u)

[[ -n "$blocked" ]] && status=2
exit "$status"
