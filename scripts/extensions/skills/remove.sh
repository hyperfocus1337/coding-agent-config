#!/bin/bash

set -e

# Remove plugin-provided skills from disk: the marketplace copy, every cache
# copy, and the backing slash-command files. A `claude plugin update` re-sync
# can still restore them, so for a durable disable prefer `claude plugin
# disable`, or add a `Skill(...)` deny rule in settings.json.

# Honors CLAUDE_CONFIG_DIR, same container workaround as apm/install.sh: target
# the container user's home when it exists and no caller value is set; leave
# unset on the host so the built-in default (~/.claude) applies.
CONTAINER_HOME="/home/$(whoami)"
if [ -z "${CLAUDE_CONFIG_DIR:-}" ] && [ -d "$CONTAINER_HOME" ]; then
  export CLAUDE_CONFIG_DIR="$CONTAINER_HOME/.claude"
fi
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

# Skill directories to remove, relative to the marketplace root. Adjust as needed.
SKILLS=(
  caveman/skills/caveman-commit
)

for skill in "${SKILLS[@]}"; do
  plugin="${skill%%/*}" # first path segment, e.g. caveman
  name="${skill##*/}" # basename, e.g. caveman-commit
  echo "==> Removing skill: $skill"
  # skill dirs: marketplace + every cache ref-hash copy (unquoted glob so * expands)
  targets=(
    "$CONFIG_DIR/plugins/marketplaces/$skill"
    "$CONFIG_DIR"/plugins/cache/"$plugin"/"$plugin"/*/skills/"$name"
    # backing slash-command files, same two trees. cache is the live tree, so
    # leaving its copies keeps /$name invocable.
    "$CONFIG_DIR/plugins/marketplaces/$plugin/commands/$name".{md,toml}
    "$CONFIG_DIR"/plugins/cache/"$plugin"/"$plugin"/*/commands/"$name".{md,toml}
  )
  for t in "${targets[@]}"; do
    [ -e "$t" ] && echo "$t"
  done
  rm -rf "${targets[@]}"
done
