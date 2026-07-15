#!/bin/bash
#
# Bootstrap a Claude Code cloud session (claude.ai/code web, Android, CI) with the
# full coding-agent-config environment. The SessionStart hook in this folder's
# settings.json fetches this file raw over https and pipes it to bash, so it must be
# self-contained: it installs its own prerequisites, clones this repo, then hands off
# to the normal install chain.
#
# No-op on local machines, where the config already exists.

set -euo pipefail

# ── Guard: remote only ────────────────────────────────────────────────────────
# Claude Code sets CLAUDE_CODE_REMOTE=true in cloud environments. Exit immediately
# elsewhere so running this on a local machine changes nothing.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO_URL="https://github.com/hyperfocus1337/coding-agent-config.git"
REPO_DIR="$HOME/coding-agent-config"
LOCAL_BIN="$HOME/.local/bin"

# The prereq installers below drop binaries into ~/.local/bin. Put it on PATH for
# the rest of this run (and for the install chain we invoke) so they resolve.
export PATH="$LOCAL_BIN:$PATH"

# ── Prerequisites ─────────────────────────────────────────────────────────────
# Each guarded by command -v so a restarted session skips work already done. The
# cloud base image ships git and the claude CLI; the rest we install here.

if ! command -v chezmoi &>/dev/null; then
  echo "==> Installing chezmoi"
  sh -c "$(curl -fsSL https://get.chezmoi.io)" -- -b "$LOCAL_BIN"
fi

if ! command -v apm &>/dev/null; then
  echo "==> Installing apm (agent package manager)"
  # aka.ms/apm-unix is the official installer; APM_INSTALL_DIR keeps it sudo-free
  # and lands the binary where update.sh expects it (~/.local/bin).
  curl -sSL https://aka.ms/apm-unix | APM_INSTALL_DIR="$LOCAL_BIN" sh
fi

if ! command -v uv &>/dev/null; then
  echo "==> Installing uv"
  # uv/uvx launch several MCP servers declared in apm.yml at runtime.
  curl -fsSL https://astral.sh/uv/install.sh | sh
fi

# node/npm power the markdown and format hooks. The cloud base image ships them; if
# they are ever absent, install.sh warns and skips those hooks rather than failing,
# so we do not install node here (heavy, distro-specific) and parity is unaffected.

# ── Clone or update the config repo ───────────────────────────────────────────
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

# ── Install ───────────────────────────────────────────────────────────────────
# install.sh does the rest: chezmoi apply ($HOME config), node hook deps, Claude
# plugins, standalone skills, and APM (MCP servers + third-party skills). Call it
# directly so we do not depend on `just` being present.
echo "==> Running install chain"
"$REPO_DIR/scripts/extensions/install.sh"

echo "==> Bootstrap complete"
