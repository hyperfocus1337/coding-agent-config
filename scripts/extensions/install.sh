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
echo "==> Syncing \$HOME with chezmoi"
if command -v chezmoi &>/dev/null; then
  chezmoi apply --source "$REPO_ROOT" --destination "$HOME"
else
  echo "ERROR: 'chezmoi' not found in PATH. Install it, then re-run." >&2
  exit 1
fi

# Node-based hooks ship a package.json but node_modules is gitignored, so chezmoi
# lays down the source without installing deps. Install them in place, or the
# hook dies with ERR_MODULE_NOT_FOUND on every trigger. Prefer `npm ci` (honors
# the committed lockfile); fall back to `npm install` if no lockfile is present.
echo "==> Installing node hook deps"
if command -v npm &>/dev/null; then
  for pkg in "$HOME"/.claude/hooks/*/package.json; do
    [ -e "$pkg" ] || continue # nullglob-free guard: skip the literal glob if no matches
    dir="$(dirname "$pkg")"
    if [ -f "$dir/package-lock.json" ]; then
      npm ci --prefix "$dir" --silent
    else
      npm install --prefix "$dir" --silent
    fi
  done
else
  echo "WARN: 'npm' not found; skipping node hook deps. Markdown/format hooks may fail." >&2
fi

# Install Claude plugins via marketplace (Claude-specific skills and plugins)
echo "==> Installing Claude plugins"
"$SCRIPT_DIR/plugins/install.sh"

# Install standalone skills (playwright, orbit).
echo "==> Installing skills"
"$SCRIPT_DIR/skills/install.sh"

# MCP servers and third-party skills are deployed via APM (apm.yml) so the
# same declarations can target other agents (not just Claude).

# Update APM only if a newer version exists (through the channel that owns the
# on-PATH binary).
"$SCRIPT_DIR/apm/update.sh"

# Install MCP servers and third-party skills via APM (apm.yml)
echo "==> Installing MCP servers and skills via APM"
"$SCRIPT_DIR/apm/install.sh"

# Disable plugins and skills we don't want enabled by default.
echo "==> Disabling unwanted plugins and skills"
"$SCRIPT_DIR/plugins/disable.sh"
"$SCRIPT_DIR/skills/remove.sh"

echo "==> Done"