#!/bin/bash

set -e

# Disable plugins whose MCP servers we don't want. A single plugin MCP server
# can't be disabled on its own, so this drops the whole plugin (including any
# wanted siblings, e.g. cloudflare-docs). See docs/mcp/disabling-servers.md.

if ! command -v claude &>/dev/null; then
  echo "ERROR: 'claude' not found in PATH." >&2
  exit 1
fi

# Plugins to disable. Adjust this list as needed.
PLUGINS=(
  cloudflare@cloudflare
  notion-workspace-plugin@notion-plugin-marketplace
  chrome-devtools-mcp@chrome-devtools-plugins
)

for plugin in "${PLUGINS[@]}"; do
  echo "==> Disabling plugin: $plugin"
  claude plugin disable "$plugin" || true # best-effort: already-disabled is fine
done
