#!/bin/bash

set -e

# Honor caller-provided CLAUDE_CONFIG_DIR if set; otherwise leave unset so claude
# uses its built-in defaults ($HOME/.claude.json sibling of $HOME/.claude/).
# Forcing a default here breaks installs where .claude.json lives at $HOME.
[ -n "${CLAUDE_CONFIG_DIR:-}" ] && export CLAUDE_CONFIG_DIR

# Ensure 'claude' CLI is available in PATH before proceeding.
if ! command -v claude &>/dev/null; then
  echo "ERROR: 'claude' not found in PATH. Check that the Claude Code install placed its binary in a directory on PATH." >&2
  echo "PATH=$PATH" >&2
  exit 1
fi

# Sync $HOME with repo before installing plugins. settings.json wires hooks
# and statusline by absolute path, so it must be in place before plugin install.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
if command -v chezmoi &>/dev/null; then
  chezmoi apply --source "$REPO_ROOT" --destination "$HOME"
else
  echo "ERROR: 'chezmoi' not found in PATH. Install it, then re-run." >&2
  exit 1
fi

# Only mutate global git config inside ephemeral build environments
# (Docker, GitHub Actions, devcontainer/Codespaces) — never on a user's host.
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

# Install Claude plugins via marketplace (Claude-specific skills and plugins)
"$SCRIPT_DIR/plugins/install.sh"

# MCP servers and third-party skills are deployed via APM (apm.yml) so the
# same declarations can target other agents (not just Claude).
"$SCRIPT_DIR/apm/install.sh"
