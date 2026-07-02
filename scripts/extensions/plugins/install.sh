#!/bin/bash

set -e

# Official plugins
# Official marketplace should be already installed (added for debugging)
# https://github.com/anthropics/claude-code/tree/main/plugins/
claude plugin marketplace add anthropics/claude-plugins-official
# https://github.com/anthropics/claude-code/tree/main/plugins/code-review
claude plugin install code-review@claude-plugins-official
# https://github.com/anthropics/claude-code/tree/main/plugins/commit-commands
# claude plugin install commit-commands@claude-plugins-official # imported a few directly in this repository under /git
# https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev
claude plugin install feature-dev@claude-plugins-official
# https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-simplifier
claude plugin install code-simplifier@claude-plugins-official

# Superpowers (consumes too many tokens)
# https://github.com/obra/superpowers
# claude plugin install superpowers@claude-plugins-official

# https://github.com/prime-radiant-inc/prime-radiant-marketplace
claude plugin marketplace add prime-radiant-inc/prime-radiant-marketplace
# https://github.com/prime-radiant-inc/iterative-development
claude plugin install iterative-development@prime-radiant-marketplace
# https://github.com/prime-radiant-inc/greenfield
claude plugin install greenfield@prime-radiant-marketplace

# Install pyright for lsp server
npm install -g pyright

# Pyright LSP plugin (waiting to be released)
# https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pyright-lsp
# Currently waiting on this: https://github.com/anthropics/claude-plugins-official/issues/379
# claude plugin install pyright-lsp@claude-plugins-official

# Replacement marketplace for LSP plugins, since the official one doesn't have any yet
# https://github.com/Piebald-AI/claude-code-lsps/
claude plugin marketplace add piebald-ai/claude-code-lsps
# https://github.com/Piebald-AI/claude-code-lsps/tree/main/pyright
claude plugin install pyright@claude-code-lsps

# Upstash plugin
# https://github.com/upstash/context7/
claude plugin marketplace add upstash/context7
# https://github.com/upstash/context7/tree/master/plugins/claude/context7
claude plugin install context7@context7-marketplace

# Whobson plugin
# https://github.com/wshobson/agents
claude plugin marketplace add wshobson/agents
# https://github.com/wshobson/agents/tree/main/plugins/code-refactoring
claude plugin install code-refactoring@claude-code-workflows

# terraform-skill moved to apm.yml (cross-agent skill). ast-grep and glab
# stay here: apm 0.23.1 can't deploy them. See docs/apm/plugin-migration.md.

# Ast-grep plugin (nested plugin layout, apm discovers 0 skills)
# https://github.com/ast-grep/agent-skill
claude plugin marketplace add ast-grep/agent-skill
claude plugin install ast-grep

# Astral plugins
# https://github.com/astral-sh/claude-code-plugins
claude plugin marketplace add astral-sh/claude-code-plugins
# https://github.com/astral-sh/claude-code-plugins/tree/main/plugins/astral
claude plugin install astral@astral-sh

# Codex for Claude Code
# https://github.com/openai/codex-plugin-cc
claude plugin marketplace add openai/codex-plugin-cc
# https://github.com/openai/codex-plugin-cc/tree/main/codex-plugin-cc
claude plugin install codex@openai-codex

# Caveman skill
# https://github.com/JuliusBrussee/caveman
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman

# Ponytail
# https://github.com/DietrichGebert/ponytail
claude plugin marketplace add DietrichGebert/ponytail
claude plugin install ponytail@ponytail

# Notion plugin
# https://github.com/makenotion/claude-code-notion-plugin
claude plugin marketplace add makenotion/claude-code-notion-plugin
claude plugin install notion-workspace-plugin@notion-plugin-marketplace

# Claude video plugin
# https://github.com/bradautomates/claude-video
claude plugin marketplace add bradautomates/claude-video
claude plugin install watch@claude-video

# Gitlab skills (stays on CLI: apm 0.23.1 --frozen sync-check rejects GitLab packages)
# https://gitlab.com/gitlab-org/ai/skills
claude plugin marketplace add https://gitlab.com/gitlab-org/ai/skills.git
claude plugin install glab@gitlab-skills

# Cloudflare skills
# https://developers.cloudflare.com/agent-setup/claude-code/
claude plugin marketplace add cloudflare/skills
claude plugin install cloudflare@cloudflare

# Playwright skills
# https://github.com/microsoft/playwright-cli
# npm install -g @playwright/cli@latest
# playwright-cli install --skills # only installed locally
