#!/bin/bash

set -e

# Add MCP servers to user scope manually. APM/MCP registration has a bug where it
# writes to ~/.claude.json instead of $CLAUDE_CONFIG_DIR/.claude.json, so we call
# `claude mcp add-json` directly, which honors CLAUDE_CONFIG_DIR.

# Same CLAUDE_CONFIG_DIR resolution as apm/install.sh: target the container user's
# home when it exists and no caller value is set; leave unset on the host so claude
# uses its built-in default.
CONTAINER_HOME="/home/$(whoami)"
if [ -z "${CLAUDE_CONFIG_DIR:-}" ] && [ -d "$CONTAINER_HOME" ]; then
  export CLAUDE_CONFIG_DIR="$CONTAINER_HOME/.claude"
fi

# Load secrets (e.g. CONTEXT7_API_KEY) from a gitignored .env beside this script.
ENV_FILE="$(dirname "$0")/.env"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

if ! command -v claude &>/dev/null; then
  echo "ERROR: 'claude' not found in PATH." >&2
  exit 1
fi

# add-json errors if the server already exists, so remove first. Makes re-runs
# idempotent. remove is best-effort (absent server is not an error we care about).
add_mcp() {
  echo "==> Registering MCP server: $1"
  claude mcp remove --scope user "$1" &>/dev/null || true
  claude mcp add-json --scope user "$1" "$2"
}

echo "Registering MCP servers (scope: user, CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-<default>})"

add_mcp tessl '{"type":"stdio","command":"tessl","args":["mcp","start"]}'
add_mcp jcodemunch '{"type":"stdio","command":"uvx","args":["jcodemunch-mcp"]}'
add_mcp jdocmunch '{"type":"stdio","command":"uvx","args":["jdocmunch-mcp"]}'
add_mcp claude-design '{"type":"http","url":"https://api.anthropic.com/v1/design/mcp"}'
add_mcp context7 "{\"type\":\"stdio\",\"command\":\"npx\",\"args\":[\"-y\",\"@upstash/context7-mcp\",\"--api-key\",\"${CONTEXT7_API_KEY}\"]}"

echo "Done. Configured MCP servers:"
claude mcp list || true
