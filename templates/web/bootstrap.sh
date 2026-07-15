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
# base image ships git, npm, uv, and the claude CLI. Each guard lets a restarted
# session skip work already done.

if ! command -v chezmoi &>/dev/null; then
  echo "==> Installing chezmoi"
  sh -c "$(curl -fsSL https://get.chezmoi.io)" -- -b "$LOCAL_BIN"
fi

if ! command -v apm &>/dev/null; then
  echo "==> Installing apm (agent package manager)"
  # The official aka.ms/apm-unix installer pulls a release binary from GitHub,
  # which cloud sessions scope out (access denied on microsoft/apm). apm also
  # ships as the apm-cli wheel on PyPI, which is reachable, so install that with
  # uv (present on the base image). uv tool drops the `apm` entrypoint in
  # ~/.local/bin, already on PATH above. Non-fatal: warn and continue so the
  # portable config (clone + chezmoi apply) still lands if this fails.
  uv tool install apm-cli \
    || echo "WARN: apm-cli install failed; skipping APM manifest." >&2
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
# `apm install -g` installs to user scope from the GLOBAL manifest at
# ~/.apm/apm.yml, not from ./apm.yml. Seed that global manifest from the repo's
# apm.yml first, so the install is deterministic regardless of cwd or apm build
# (some versions never read ./apm.yml under -g and just report the global
# manifest missing). The manifest resolves skills, MCP servers, and the LSP
# block. MCP servers that interpolate secrets (${CONTEXT7_API_KEY}) register
# with whatever is in the environment; unset vars leave those servers
# non-functional but do not fail the install. The pyright LSP registers only if
# pyright-langserver is on $PATH. --force overwrites on collision, keeping
# re-runs idempotent. (--refresh is not valid with -g, so it is omitted.)
if command -v apm &>/dev/null; then
  echo "==> Installing APM dependencies (skills, MCP, LSP)"
  mkdir -p "$HOME/.apm"
  cp "$REPO_DIR/apm.yml" "$HOME/.apm/apm.yml"
  apm install -g --force \
    || echo "WARN: apm install failed; skills/MCP/LSP from apm.yml not installed." >&2
else
  echo "WARN: 'apm' not found; skipping APM manifest (skills, MCP, LSP)." >&2
fi

echo "==> Bootstrap complete"
