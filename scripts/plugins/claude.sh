#!/bin/bash

set -e

if ! command -v claude &>/dev/null; then
    echo "ERROR: 'claude' not found in PATH. Check that the Claude Code install placed its binary in a directory on PATH." >&2
    echo "PATH=$PATH" >&2
    exit 1
fi

# Force HTTPS for any github SSH URLs declared by plugin marketplaces.
# Avoids SSH key requirement inside containers.
git config --global url."https://github.com/".insteadOf "git@github.com:"
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

# Official plugins
# Official marketplace should be already installed (added for debugging)
# https://github.com/anthropics/claude-code/tree/main/plugins/
claude plugin marketplace add anthropics/claude-plugins-official
# https://github.com/anthropics/claude-code/tree/main/plugins/code-review
claude plugin install code-review@claude-plugins-official
# https://github.com/anthropics/claude-code/tree/main/plugins/commit-commands
claude plugin install commit-commands@claude-plugins-official
# https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev
claude plugin install feature-dev@claude-plugins-official
# https://github.com/obra/superpowers
claude plugin install superpowers@claude-plugins-official

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
claude plugin install context7-plugin@context7-marketplace

# Whobson plugin
# https://github.com/wshobson/agents
claude plugin marketplace add wshobson/agents
# https://github.com/wshobson/agents/tree/main/plugins/code-refactoring
claude plugin install code-refactoring@claude-code-workflows

# Ast-grep plugin
# https://github.com/ast-grep/agent-skill
claude plugin marketplace add ast-grep/agent-skill
# https://github.com/ast-grep/agent-skill/tree/main/ast-grep
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

# Notion plugin
# https://github.com/makenotion/claude-code-notion-plugin
claude plugin marketplace add makenotion/claude-code-notion-plugin
claude plugin install notion-workspace-plugin@notion-plugin-marketplace

# Playwright skills (only if playwright-cli present)
# https://github.com/microsoft/playwright-cli
if command -v playwright-cli &>/dev/null; then
    playwright-cli install --skills
fi

# Global MCP servers (user scoped)
# https://docs.tessl.io/reference/custom-agent-setup
claude mcp add --scope user tessl -- tessl mcp start
# https://github.com/upstash/context7?tab=readme-ov-file#installation
claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp
# https://github.com/jgravelle/jcodemunch-mcp?tab=readme-ov-file#configure-mcp-client
claude mcp add --scope user jcodemunch -- uvx jcodemunch-mcp
# https://github.com/jgravelle/jdocmunch-mcp?tab=readme-ov-file#configure-an-mcp-client
claude mcp add --scope user jdocmunch -- uvx jdocmunch-mcp
# https://stitch.withgoogle.com/docs/mcp/setup
claude mcp add --scope user stitch --transport http https://stitch.googleapis.com/mcp --header "X-Goog-Api-Key: api-key"