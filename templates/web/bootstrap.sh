#!/bin/bash
#
# Lite bootstrap for Claude Code cloud sessions (claude.ai/code web, Android, CI).
# The SessionStart hook in this folder's settings.json fetches this file raw over
# https and pipes it to bash, so it must be self-contained.
#
# It installs the portable config: the whole ~/.claude (skills, commands, rules,
# hooks, CLAUDE.md, statusline) plus the full APM manifest (skill bundles, MCP
# servers, and the pyright LSP). It deliberately skips the Claude plugin
# marketplace and playwright browsers, which would turn a per-session hook into a
# multi-minute install. See README.md for the trade-off and MCP secret setup.
#
# No-op on local machines, where the config already exists.

set -euo pipefail

# --- Guard: remote only ---
# Claude Code sets CLAUDE_CODE_REMOTE=true in cloud environments. Exit immediately
# elsewhere so running this on a local machine changes nothing.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO_URL="https://github.com/hyperfocus1337/coding-agent-config.git"
REPO_DIR="$HOME/coding-agent-config"
LOCAL_BIN="$HOME/.local/bin"

# The prereq installers below drop binaries into ~/.local/bin. Put it on PATH for
# the rest of this run so they resolve.
export PATH="$LOCAL_BIN:$PATH"

# --- Prerequisites ---
# Only chezmoi (config files) and apm (dependencies) are needed here. The cloud
# base image ships git, npm, and the claude CLI. Each guard lets a restarted
# session skip work already done.

if ! command -v chezmoi &>/dev/null; then
  echo "==> Installing chezmoi"
  sh -c "$(curl -fsSL https://get.chezmoi.io)" -- -b "$LOCAL_BIN"
fi

if ! command -v apm &>/dev/null; then
  echo "==> Installing apm (agent package manager)"
  # aka.ms/apm-unix is the official installer; APM_INSTALL_DIR keeps it sudo-free
  # and lands the binary in ~/.local/bin.
  curl -sSL https://aka.ms/apm-unix | APM_INSTALL_DIR="$LOCAL_BIN" sh
fi

# --- Clone or update the config repo ---
if [ -d "$REPO_DIR/.git" ]; then
  echo "==> Updating coding-agent-config"
  # fetch + hard reset is idempotent and survives any divergence in the throwaway
  # clone, where a plain pull could stall on a non-fast-forward.
  git -C "$REPO_DIR" fetch --depth 1 origin main
  git -C "$REPO_DIR" reset --hard origin/main
else
  echo "==> Cloning coding-agent-config"
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
fi

# --- Apply portable config to $HOME ---
echo "==> Applying config with chezmoi"
chezmoi apply --source "$REPO_DIR" --destination "$HOME"

# --- Node hook dependencies ---
# Node-based hooks ship source but node_modules is gitignored, so chezmoi lays down
# the source without installing deps. Install them in place, or the hook dies with
# ERR_MODULE_NOT_FOUND on every trigger.
if command -v npm &>/dev/null; then
  echo "==> Installing node hook deps"
  for pkg in "$HOME"/.claude/hooks/*/package.json; do
    [ -e "$pkg" ] || continue # skip the literal glob if no matches
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

# --- APM dependencies (full manifest) ---
# A bare `apm install` resolves the whole apm.yml: skills, MCP servers, and the
# LSP block. MCP servers that interpolate secrets (${TESSL_TOKEN},
# ${CONTEXT7_API_KEY}) register with whatever is in the environment; unset vars
# leave those servers non-functional but do not fail the install. The pyright
# LSP registers only if pyright-langserver is on $PATH. Run from $REPO_DIR so
# apm reads its apm.yml; -g installs to user scope. --refresh re-fetches upstream
# and re-resolves ref pins to latest, --force overwrites on collision, keeping
# re-runs idempotent.
echo "==> Installing APM dependencies (skills, MCP, LSP)"
(cd "$REPO_DIR" && apm install -g --refresh --force)

echo "==> Bootstrap complete"
