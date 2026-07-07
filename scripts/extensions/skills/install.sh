#!/bin/bash

set -e

echo "==> Installing playwright skills"
# Playwright skills
# https://github.com/microsoft/playwright-cli
# Depends on playwright-cli
npm install -g @playwright/cli@latest
# Installing locally from home directory installs it globally
cd "$HOME" && playwright-cli install --skills

echo "==> Installing orbit skill"
# Orbit skill for GitLab AI coding agents
# https://docs.gitlab.com/orbit/ai_coding_agents/
# Depends on glab CLI
glab skills install --global orbit
