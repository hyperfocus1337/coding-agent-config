#!/bin/bash

set -e

# Remove plugin-provided skills from disk. Deletes only the marketplace copy;
# cache copies under plugins/cache/ remain and a `claude plugin update` re-sync
# may restore them. For a durable disable prefer `claude plugin disable`, or add
# a `Skill(...)` deny rule in settings.json.

# Honors CLAUDE_CONFIG_DIR, same container workaround as mcp/remove.sh: target
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
  dir="$CONFIG_DIR/plugins/marketplaces/$skill"
  echo "==> Removing skill: $skill"
  rm -rf "$dir" # best-effort: absent is fine
done
