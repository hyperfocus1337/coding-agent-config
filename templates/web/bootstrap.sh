#!/bin/bash
#
# Lite bootstrap for Claude Code cloud sessions (claude.ai/code web, Android, CI).
# The SessionStart hook in this folder's settings.json fetches this file raw over
# https and pipes it to bash, so it must be self-contained.
#
# It installs the portable config: the whole ~/.claude (skills, commands, rules,
# hooks, CLAUDE.md) plus the cloud APM manifest in this folder (MCP servers
# and the pyright LSP, no skills). It deliberately skips the Claude plugin
# marketplace and playwright browsers, which would turn a per-session hook into a
# multi-minute install. The statusline is left out: chezmoi drops it when
# CLAUDE_CODE_REMOTE=true. See README.md for the trade-off and MCP secret setup.
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
MISE_VERSION="2026.10.18"

# The prereq installers below drop binaries into ~/.local/bin. Put it on PATH for
# the rest of this run so they resolve.
export PATH="$LOCAL_BIN:$PATH"

# --- Prerequisites ---
# mise installs the CLI tools in templates/web/mise.toml (chezmoi), and apm
# installs the dependencies. The cloud base image ships git, npm, uv, and the
# claude CLI. Each guard lets a restarted session skip work already done.

if ! command -v mise &>/dev/null; then
  echo "==> Installing mise $MISE_VERSION"
  # The mise npm package gets its binary from the npm registry, which the cloud
  # proxy allows. The mise.run installer needs mise.jdx.dev, which it does not.
  npm install -g --prefix "$HOME/.local" --silent "mise@$MISE_VERSION"
fi

if ! command -v apm &>/dev/null; then
  echo "==> Installing apm (agent package manager)"
  # Install the apm-cli wheel from PyPI with uv, not the aka.ms/apm-unix binary
  # installer (GitHub-scoped out in cloud sessions). Non-fatal so the config
  # still lands if it fails. See README "Lessons learned" for why.
  uv tool install apm-cli ||
    echo "WARN: apm-cli install failed; skipping APM manifest." >&2
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

# --- CLI tools from templates/web/mise.toml ---
# Locked mode takes each download URL and checksum from mise.lock, so mise skips
# the GitHub release lookups that the cloud proxy answers with 403. With the
# versions host off, mise sends no requests to mise-versions.jdx.dev, which is
# not on the cloud allowlist.
echo "==> Installing CLI tools with mise"
export MISE_LOCKED=true MISE_USE_VERSIONS_HOST=false
mise -C "$REPO_DIR/templates/web" install
# Link each tool into ~/.local/bin, which CLAUDE_ENV_FILE puts on PATH for the
# session's Bash calls below. A mise shim would not work there: the session's repo
# has no mise config that selects these tools.
ln -sf "$(mise -C "$REPO_DIR/templates/web" which chezmoi)" "$LOCAL_BIN/chezmoi"

# Claude Code runs CLAUDE_ENV_FILE before each Bash command, so the binaries in
# ~/.local/bin (mise, apm, chezmoi) resolve after this hook exits too.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$LOCAL_BIN:\$PATH\"" >>"$CLAUDE_ENV_FILE"
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

# --- APM dependencies (cloud manifest) ---
# `apm install -g` reads the GLOBAL manifest at ~/.apm/apm.yml, not ./apm.yml,
# so seed it from templates/web/apm.yml first (deterministic across apm builds
# and cwd). That manifest has the MCP servers and the pyright LSP, but no skills.
# --refresh is omitted (not valid with -g); --force keeps re-runs idempotent. See
# README "Lessons learned" for the manifest-resolution and secrets details.
if command -v apm &>/dev/null; then
  echo "==> Installing APM dependencies (MCP, LSP)"
  mkdir -p "$HOME/.apm"
  cp "$REPO_DIR/templates/web/apm.yml" "$HOME/.apm/apm.yml"
  if apm install -g --force; then
    # apm writes the LSP as the plugin ~/.claude/skills/apm-lsp. Claude Code
    # scanned for plugins before this hook ran, so this session needs a reload.
    echo "NOTE: run /reload-plugins --force to load the pyright LSP in this session."
  else
    echo "WARN: apm install failed; MCP/LSP from apm.yml not installed." >&2
  fi
else
  echo "WARN: 'apm' not found; skipping APM manifest (MCP, LSP)." >&2
fi

echo "==> Bootstrap complete"
