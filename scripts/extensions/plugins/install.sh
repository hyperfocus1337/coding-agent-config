#!/bin/bash

set -e

# Install every user-scope plugin declared in the install-plugins catalog.
# The catalog is the single declaration of which plugins belong at user scope;
# this script only executes it. Rows scoped `project` or `local` are installed
# per repo by the install-plugins skill, never here.
#
# Enable/disable state is NOT here: dot_claude/settings.json owns it and
# disable.sh applies it after this script runs.

# --- Container git config ---
# Only mutate global git config inside ephemeral build environments
# (Docker, GitHub Actions, devcontainer/Codespaces), never on a user's host.
if [ -f /.dockerenv ] ||
  [ "${GITHUB_ACTIONS:-}" = "true" ] ||
  [ "${REMOTE_CONTAINERS:-}" = "true" ] ||
  [ -n "${CODESPACES:-}" ] ||
  [ -n "${DEVCONTAINER:-}" ] ||
  [ -f /.devcontainer.json ]; then
  # Force HTTPS for any github SSH URLs declared by plugin marketplaces.
  # Avoids SSH key requirement inside containers. Multi-valued, so --add
  # duplicates on re-run; gate each value on whether it's already present.
  for from in "git@github.com:" "ssh://git@github.com/" "git://github.com/"; do
    # -x exact line, -F literal (URLs contain regex metachars like '/').
    if ! git config --global --get-all url."https://github.com/".insteadOf 2>/dev/null | grep -qxF "$from"; then
      git config --global --add url."https://github.com/".insteadOf "$from"
    fi
  done
fi

# --- Preflight ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CATALOG="$REPO_ROOT/dot_claude/skills/install-plugins/references/plugins.json"

for bin in claude jq; do
  if ! command -v "$bin" &>/dev/null; then
    echo "ERROR: '$bin' not found in PATH." >&2
    exit 1
  fi
done
if [ ! -f "$CATALOG" ]; then
  echo "ERROR: plugin catalog not found at $CATALOG" >&2
  exit 1
fi

# --- Marketplaces ---
# Add each distinct marketplace once. Idempotent: re-adding an existing
# marketplace reports it and exits 0.
echo "==> Adding plugin marketplaces"
while read -r source; do
  echo "==> Marketplace: $source"
  claude plugin marketplace add "$source"
done < <(jq -r '[.plugins[] | select(.scope == "user") | .marketplace.source] | unique[]' "$CATALOG")

# --- Plugins ---
# Install every user-scope row. Ids carry @marketplace so resolution never
# depends on which marketplaces a machine happens to have.
echo "==> Installing user-scope plugins"
while read -r id; do
  echo "==> Plugin: $id"
  claude plugin install "$id"
done < <(jq -r '.plugins[] | select(.scope == "user") | .id' "$CATALOG")

# --- Binaries ---
# Not a plugin: pyright-lsp bridges to this language server, which must be on
# PATH before the plugin can start it.
echo "==> Installing pyright language server"
npm install -g pyright
