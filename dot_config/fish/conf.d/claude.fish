# Fish sources this file at startup. The bash and zsh version, with the full
# explanation, is ~/.claude/claude.sh.

function claude --description 'Claude Code with settings-minimal.json'
    ENABLE_CLAUDEAI_MCP_SERVERS=false command claude --settings $HOME/.claude/settings-minimal.json $argv
end

function claude-nohooks --description 'Claude Code with settings-minimal.json, no hooks or status line'
    ENABLE_CLAUDEAI_MCP_SERVERS=false command claude --settings (jq -c '.disableAllHooks = true' $HOME/.claude/settings-minimal.json) $argv
end

function claude-full --description 'Claude Code with the full settings'
    env -u ENABLE_CLAUDEAI_MCP_SERVERS claude $argv
end
