#!/bin/bash

set -e

# --- Playwright skills ---
# https://github.com/microsoft/playwright-cli
# Depends on playwright-cli
echo "==> Installing playwright skills"
npm install -g @playwright/cli@latest
# Installing locally from home directory installs it globally
cd "$HOME" && playwright-cli install --skills

# --- glab update ---
# Update glab through whichever channel owns the on-PATH binary. Skip cleanly
# when neither brew nor mise manages it (e.g. distro package), and skip the
# upgrade when it's already current.
echo "==> Updating glab"
if command -v brew >/dev/null 2>&1 && brew list --formula glab >/dev/null 2>&1; then
  if [ -n "$(brew outdated --formula glab)" ]; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew upgrade glab
  else
    echo "==> glab already up to date"
  fi
elif command -v mise >/dev/null 2>&1 && mise which glab >/dev/null 2>&1; then
  mise upgrade glab
else
  echo "!! glab not managed by brew or mise, skipping update"
fi

# --- Orbit skill ---
# Orbit skill for GitLab AI coding agents
# https://docs.gitlab.com/orbit/ai_coding_agents/
# Depends on glab CLI
echo "==> Installing orbit skill"
glab skills install --global orbit
