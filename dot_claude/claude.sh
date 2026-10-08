# shellcheck shell=bash
# Source from ~/.bashrc or ~/.zshrc: `. ~/.claude/claude.sh`. Fish loads the
# same functions from ~/.config/fish/conf.d/claude.fish.
#
# ~/.claude/settings.json holds the full config. `claude` adds the denies and
# disable flags in settings-minimal.json as a --settings layer; `claude-full`
# runs without it. Both share ~/.claude, so history and sessions are shared.
#
# Only shells that load these functions get the minimal layer. The IDE
# extension, the desktop app, and scripts that start `claude` run with the full
# config. Claude Code keeps only the last --settings flag, so
# `claude --settings X` replaces the minimal layer.
#
# `claude` also sets ENABLE_CLAUDEAI_MCP_SERVERS=false, which turns off the
# claude.ai MCP servers. `claude-full` removes it, because a `claude-full`
# started from a `claude` session inherits it.

claude() { ENABLE_CLAUDEAI_MCP_SERVERS=false command claude --settings "$HOME/.claude/settings-minimal.json" "$@"; }
claude-full() { env -u ENABLE_CLAUDEAI_MCP_SERVERS claude "$@"; }
