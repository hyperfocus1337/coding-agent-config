# Fish sources this file at startup. The bash and zsh version is
# ~/.claude/claude.sh. What each mode loads, and its limits:
# dot_claude/docs/launch-modes.md in the chezmoi source.

function claude --description 'Claude Code with settings-minimal.json'
    claude-rules --mode claude -- $argv
end

function claude-nohooks --description 'Claude Code with settings-minimal.json, no hooks or status line'
    claude-rules --mode claude-nohooks -- $argv
end

function claude-norules --description 'Claude Code with settings-minimal.json, no CLAUDE.md or rules'
    claude-rules --mode claude-norules -- $argv
end

function claude-nohooks-norules --description 'Claude Code with settings-minimal.json, no hooks, status line, CLAUDE.md, or rules'
    claude-rules --mode claude-nohooks-norules -- $argv
end

function claude-vanilla --description 'Claude Code with settings-vanilla.json only, no user or project settings, CLAUDE.md, rules, hooks, plugins, or MCP servers'
    claude-rules --mode claude-vanilla -- $argv
end

function claude-vanilla-minimal --description 'claude-vanilla plus settings-minimal.json'
    claude-rules --mode claude-vanilla-minimal -- $argv
end

function claude-full --description 'Claude Code with the full settings'
    claude-rules --mode claude-full -- $argv
end

function claude-include-rules --description 'Claude Code with only the named user rules (comma-separated)'
    claude-rules --include "$argv[1]" -- $argv[2..-1]
end

function claude-exclude-rules --description 'Claude Code without the named user rules (comma-separated)'
    claude-rules --exclude "$argv[1]" -- $argv[2..-1]
end

function claude-rules --description 'Claude Code with a launch mode and optional user rule filters'
    command bash $HOME/.claude/launch.sh $argv
end
