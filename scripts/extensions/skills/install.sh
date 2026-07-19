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
# Update glab based on how it was installed (brew or mise)
echo "==> Updating glab"
glab_path="$(command -v glab || true)"
case "$glab_path" in
  "$(brew --prefix 2>/dev/null)"/*) brew upgrade glab ;;
  *mise*)                           mise upgrade glab ;;
  *)                                echo "!! Unknown glab install method, skipping update" ;;
esac

# --- Orbit skill ---
# Orbit skill for GitLab AI coding agents
# https://docs.gitlab.com/orbit/ai_coding_agents/
# Depends on glab CLI
echo "==> Installing orbit skill"
glab skills install --global orbit
