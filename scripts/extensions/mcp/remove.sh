#!/bin/bash

set -e

# Remove user-scope MCP servers. Only user/local/project-scope servers can be
# removed via CLI; plugin-provided servers are handled by
# plugins/disable.sh instead. See docs/mcp/disabling-servers.md.

# Honors CLAUDE_CONFIG_DIR, same bug workaround as install.sh: target the
# container user's home when it exists and no caller value is set; leave unset on
# the host so claude uses its built-in default.
CONTAINER_HOME="/home/$(whoami)"
if [ -z "${CLAUDE_CONFIG_DIR:-}" ] && [ -d "$CONTAINER_HOME" ]; then
  export CLAUDE_CONFIG_DIR="$CONTAINER_HOME/.claude"
fi

if ! command -v claude &>/dev/null; then
  echo "ERROR: 'claude' not found in PATH." >&2
  exit 1
fi

# MCP servers to remove. Adjust this list as needed.
SERVERS=(
  orbit
  tessl
  directus
  claude-design
  # jcodemunch 
  # jdocmunch
)

for name in "${SERVERS[@]}"; do
  echo "==> Removing MCP server: $name"
  claude mcp remove --scope user "$name" &>/dev/null || true # best-effort: absent is fine
done
