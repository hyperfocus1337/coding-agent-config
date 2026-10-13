#!/usr/bin/env bash
# Records the files a Bash call changed in the git repo of the session cwd.
# PreToolUse snapshots the working tree as a git tree, PostToolUse and
# PostToolUseFailure snapshot it again and append the difference to
# <transcript dir>/<session id>/bash-changes.tsv: time, status (A, M, D), path.
# The session-files skill reads that log. Advisory: always exits 0, prints
# nothing.
set -u

# --- Payload ---
command -v jq >/dev/null && command -v git >/dev/null || exit 0
# The unit separator keeps empty fields, which a tab IFS would merge. jq makes
# the timestamp because BSD date has no milliseconds; the transcript has them.
IFS=$'\x1f' read -r event id tool_use_id cwd transcript now < <(jq -r '[.hook_event_name,
  .session_id, .tool_use_id, .cwd, .transcript_path] | map(. // "")
  + [now | strftime("%Y-%m-%dT%H:%M:%S.") + ("00" + (. * 1000 % 1000 | floor | tostring))[-3:] + "Z"]
  | join("\u001f")' 2>/dev/null) || exit 0
[[ -n $id && -n $tool_use_id && -n $transcript ]] || exit 0

# A subagent transcript sits in <project>/<session id>/subagents/, so cut the
# path at the session id to reach the main session directory either way.
dir=${transcript%%/"$id"[./]*}/$id
pending=$dir/bash-pending/$tool_use_id

# --- Snapshot ---
# Point git at the session object directory for repo $1. It holds only trees
# and reads the repo objects as an alternate, so the hook never writes to the
# repo. Runs in the main shell, so diff-tree also sees the exports.
use_repo() {
  top=$1
  local objects
  objects=$(git -C "$top" rev-parse --path-format=absolute --git-path objects) || return 1
  index=$dir/bash-index/$(printf '%s' "$top" | git hash-object --stdin)
  mkdir -p "$dir/bash-pending" "$dir/bash-index" "$dir/bash-objects" || return 1
  export GIT_OBJECT_DIRECTORY=$dir/bash-objects GIT_ALTERNATE_OBJECT_DIRECTORIES=$objects
}

# Write the working tree as a tree object and print its ID. Each session keeps
# one index per repo, so git rehashes only the files whose stat changed since
# the last snapshot. --info-only hashes a file without storing it.
snapshot() {
  local tmp tree
  # Parallel Bash calls share the index, so work on a copy and rename it back.
  tmp=$(mktemp "$index.XXXXXX") || return 1
  if [[ -f $index ]]; then cp "$index" "$tmp"
  else cp "$(git -C "$top" rev-parse --path-format=absolute --git-path index)" "$tmp" 2>/dev/null || rm -f "$tmp"
  fi
  tree=$(GIT_INDEX_FILE=$tmp git -C "$top" ls-files -z -m -o -d --exclude-standard |
    GIT_INDEX_FILE=$tmp git -C "$top" update-index -z --add --remove --replace --info-only --stdin 2>/dev/null &&
    GIT_INDEX_FILE=$tmp git -C "$top" write-tree --missing-ok 2>/dev/null)
  [[ -f $tmp ]] && mv -f "$tmp" "$index"
  [[ -n $tree ]] && echo "$tree"
}

# --- Record ---
case $event in
  PreToolUse)
    # The logical path keeps symlinks, so a Bash path matches the Edit and
    # Write paths in the transcript; --show-toplevel would resolve them.
    cdup=$(git -C "$cwd" rev-parse --show-cdup 2>/dev/null) || exit 0
    top=$(cd "$cwd/$cdup" && pwd -L) || exit 0
    use_repo "$top" || exit 0
    tree=$(snapshot) && printf '%s\t%s\n' "$top" "$tree" >"$pending"
    ;;
  PostToolUse | PostToolUseFailure)
    [[ -f $pending ]] || exit 0
    IFS=$'\t' read -r top before <"$pending"
    rm -f "$pending"
    use_repo "$top" || exit 0
    after=$(snapshot) || exit 0
    [[ $after == "$before" ]] && exit 0
    git -C "$top" diff-tree -r -z --no-renames --name-status "$before" "$after" |
      while IFS= read -r -d '' status && IFS= read -r -d '' path; do
        printf '%s\t%s\t%s\n' "$now" "$status" "$top/$path"
      done >>"$dir/bash-changes.tsv"
    ;;
esac
exit 0
