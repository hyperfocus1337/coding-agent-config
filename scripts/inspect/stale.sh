#!/bin/bash

set -euo pipefail

# Report leftovers from file and directory movements in the skills and commands
# trees. Three symptoms of a move that was not finished:
#   1. A deployed path under ~/.claude that chezmoi no longer manages (chezmoi
#      unmanaged). chezmoi apply never deletes, so the old path stays after a
#      rename in the repo. Paths that .chezmoiignore covers are not listed.
#   2. An empty directory, in the repo or in ~/.claude, whose files moved away.
#   3. A skill catalog row whose `dir` no longer exists.
# Default: report only, exit 1 if it finds any. With --delete: print the same
# report, then remove the paths from checks 1 and 2 after a confirm prompt.
# Check 3 is a JSON row, so it always stays a manual edit.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAUDE_HOME="$HOME/.claude" # chezmoi deploys here; set HOME to scan another copy
CATALOG="$REPO/dot_claude/skills/install-skills/references/skills.json"

findings=0

# Print a heading and the indented paths. Nothing if there are no paths.
section() {
  local title="$1" body="$2"
  if [[ -n "$body" ]]; then
    printf '\n%s\n' "$title"
    printf '  %s\n' "${body//$'\n'/$'\n'  }"
    findings=$((findings + $(wc -l <<<"$body")))
  fi
}

# Trees to scan, in the repo (chezmoi source) and in the deployed copy.
src_dirs=("$REPO/dot_claude/skills" "$REPO/dot_claude/commands")
out_dirs=("$CLAUDE_HOME/skills" "$CLAUDE_HOME/commands")

# Paths under ~/.claude/skills that another channel owns, so an unmanaged path
# there is expected, not stale: APM installs from apm.yml, and Claude Code's own
# cloud sync bucket.
own="$(
  echo "$CLAUDE_HOME/skills/synced"
  yq -r '.dependencies.apm[] | (.skills[] // (.git | split("/") | .[-1]))' "$REPO/apm.yml" |
    sed "s|^|$CLAUDE_HOME/skills/|"
)"

# ${exists[@]+"${exists[@]}"}: an empty array is unbound under set -u in bash 3.2.
exists=()
for dir in "${out_dirs[@]}"; do [[ -d "$dir" ]] && exists+=("$dir"); done

# 1. Deployed but unmanaged: the old path of a move, or stray junk. chezmoi
# prints the top unmanaged entry and does not descend into it.
orphans=""
if ((${#exists[@]} > 0)); then
  orphans="$(chezmoi unmanaged --source "$REPO" --destination "$HOME" --path-style absolute "${exists[@]}" |
    grep -vxF -f <(echo "$own") || true)"
fi
section "Deployed, no longer in the repo (chezmoi apply leaves these behind):" "$orphans"

# 2. Empty directories: the files moved out, the directory stayed.
empty="$(find "${src_dirs[@]}" ${exists[@]+"${exists[@]}"} -mindepth 1 -type d -empty \
  -not -path "$CLAUDE_HOME/skills/synced/*" | sort)"
section "Empty directory (its files moved away):" "$empty"

# 3. Catalog rows that point at a directory that moved.
section "Skill catalog row points at a missing directory ($CATALOG):" \
  "$(jq -r '.skills[] | select(.dir) | .dir' "$CATALOG" |
    while read -r dir; do [[ -e "$REPO/$dir" ]] || echo "$dir"; done)"

if ((findings == 0)); then
  echo "No stale files in the skills and commands trees."
  exit 0
fi
printf '\n%d stale path(s).\n' "$findings"
[[ "${1:-}" == "--delete" ]] || exit 1

# Checks 1 and 2 only. An empty directory can also sit inside an unmanaged
# one; rm -rf on a path that a parent already removed is a no-op.
deletable="$(printf '%s\n%s\n' "$orphans" "$empty" | sed '/^$/d')"
if [[ -z "$deletable" ]]; then
  echo "Nothing to delete: the remaining rows are catalog entries, edit $CATALOG by hand."
  exit 1
fi
read -r -p "Delete the $(wc -l <<<"$deletable" | tr -d ' ') path(s) from the first two sections? [y/N] " ans
if [[ "$ans" != [yY] ]]; then
  echo "Aborted."
  exit 1
fi
while IFS= read -r path; do
  [[ -n "$path" ]] && rm -rf "$path"
done <<<"$deletable"
echo "Removed."
