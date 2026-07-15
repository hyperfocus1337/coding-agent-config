#!/bin/bash
#
# Lite bootstrap for Claude Code cloud sessions (claude.ai/code web, Android, CI).
# The SessionStart hook in this folder's settings.json fetches this file raw over
# https and pipes it to bash, so it must be self-contained.
#
# It installs the portable config only: the whole ~/.claude (skills, commands,
# rules, hooks, CLAUDE.md, statusline) plus the APM skill bundles. It deliberately
# skips the Claude plugin marketplace, playwright browsers, and MCP/LSP servers,
# which would turn a per-session hook into a multi-minute install. See README.md
# for the trade-off and how to get full parity when you need it.
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
# Only chezmoi (config files) and apm (skills) are needed for the lite install.
# The cloud base image ships git, npm, and the claude CLI. Each guard lets a
# restarted session skip work already done.

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

# --- APM skills only ---
# --only apm installs just the skill deps, skipping the mcp: and lsp: blocks so
# no MCP/LSP servers are registered. Run from $REPO_DIR so apm reads its apm.yml;
# -g still installs to user scope. --update re-resolves to latest upstream and
# --force overwrites on collision, keeping re-runs idempotent.
echo "==> Installing APM skills"
(cd "$REPO_DIR" && apm install -g --only apm --update --force)

echo "==> Bootstrap complete"
