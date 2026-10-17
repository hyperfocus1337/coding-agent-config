# Fish sources this file at startup. The bash and zsh version, with the full
# explanation, is ~/.claude/claude.sh.

function claude --description 'Claude Code with settings-minimal.json'
    ENABLE_CLAUDEAI_MCP_SERVERS=false command claude --settings $HOME/.claude/settings-minimal.json $argv
end

function claude-nohooks --description 'Claude Code with settings-minimal.json, no hooks or status line'
    ENABLE_CLAUDEAI_MCP_SERVERS=false command claude --settings (jq -c '.disableAllHooks = true' $HOME/.claude/settings-minimal.json) $argv
end

function claude-norules --description 'Claude Code with settings-minimal.json, no hooks, status line, CLAUDE.md, or rules'
    CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 claude-nohooks $argv
end

function claude-vanilla --description 'Claude Code with settings-vanilla.json only, no user or project settings, CLAUDE.md, rules, hooks, plugins, or MCP servers'
    ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 command claude --setting-sources '' --strict-mcp-config --settings $HOME/.claude/settings-vanilla.json $argv
end

function claude-full --description 'Claude Code with the full settings'
    env -u ENABLE_CLAUDEAI_MCP_SERVERS claude $argv
end
