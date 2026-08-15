#!/bin/bash

set -e

# Apply the disabled flags from dot_claude/settings.json.
#
# settings.json owns enable/disable state: chezmoi deploys it to
# ~/.claude/settings.json, which is the same file `claude plugin disable`
# writes. Reading the flags from there keeps one list instead of two, and a
# plugin installed by install.sh right after chezmoi ran gets its flag
# reapplied here.
#
# Which plugins exist and where they belong is a different question, answered
# by the install-plugins catalog. A plugin is disabled here, and not
# uninstalled, when its MCP servers would otherwise load: a single plugin MCP
# server cannot be disabled on its own. See docs/mcp/disabling-servers.md.

# --- Preflight ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SETTINGS="$REPO_ROOT/dot_claude/settings.json"

for bin in claude jq; do
  if ! command -v "$bin" &>/dev/null; then
    echo "ERROR: '$bin' not found in PATH." >&2
    exit 1
  fi
done
if [ ! -f "$SETTINGS" ]; then
  echo "ERROR: settings.json not found at $SETTINGS" >&2
  exit 1
fi

# --- Disable loop ---
while read -r plugin; do
  echo "==> Disabling plugin: $plugin"
  claude plugin disable "$plugin" || true # best-effort: already-disabled is fine
done < <(jq -r '.enabledPlugins | to_entries[] | select(.value == false) | .key' "$SETTINGS")
