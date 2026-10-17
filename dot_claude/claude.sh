# shellcheck shell=bash
# Source from ~/.bashrc or ~/.zshrc: `. ~/.claude/claude.sh`. Fish loads the
# same functions from ~/.config/fish/conf.d/claude.fish. What each mode loads,
# and its limits: dot_claude/docs/launch-modes.md in the chezmoi source.

claude() { ENABLE_CLAUDEAI_MCP_SERVERS=false command claude --settings "$HOME/.claude/settings-minimal.json" "$@"; }
claude-nohooks() { ENABLE_CLAUDEAI_MCP_SERVERS=false command claude --settings "$(jq -c '.disableAllHooks = true' "$HOME/.claude/settings-minimal.json")" "$@"; }
claude-norules() { CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 claude-nohooks "$@"; }
claude-vanilla() { ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 command claude --setting-sources '' --strict-mcp-config --settings "$HOME/.claude/settings-vanilla.json" "$@"; }
claude-full() { env -u ENABLE_CLAUDEAI_MCP_SERVERS claude "$@"; }
