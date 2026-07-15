# Disabling MCP servers in Claude Code

There are three kinds of MCP server, and each disables differently. Getting this wrong is easy because the settings look like they apply broadly but don't.

## The three kinds

| Kind                   | Shown in `claude mcp list` as | Stored in                                               | How to remove/disable                     |
|------------------------|-------------------------------|---------------------------------------------------------|-------------------------------------------|
| User / local / project | `name: ...`                   | `~/.claude.json` (or `$CLAUDE_CONFIG_DIR/.claude.json`) | `claude mcp remove <name>`                |
| Project `.mcp.json`    | `name: ...` (⏸ pending)       | repo `.mcp.json`                                        | `disabledMcpjsonServers` in settings.json |
| Plugin-provided        | `plugin:<plugin>:<name>`      | the installed plugin                                    | disable the whole plugin only             |

## Key findings

`claude mcp remove <name>` only works for user/local/project-scope servers. Its `--scope` flag accepts `local`, `user`, or `project`, with no plugin scope. Absent servers are best-effort (wrap in `|| true`).

`disabledMcpjsonServers` (settings.json) applies **only** to servers defined in a project `.mcp.json` file. It does nothing for user-scope servers (added via `claude mcp add-json --scope user`) and nothing for plugin-provided servers. Listing user/plugin server names there is a silent no-op.

Plugin-provided MCP servers (prefix `plugin:<plugin>:<name>`) cannot be removed by `claude mcp remove`, and there is no settings key to disable a single one. The only lever is disabling the entire owning plugin in `enabledPlugins`. That drops every server the plugin provides, including wanted siblings (e.g. disabling the cloudflare plugin to drop `cloudflare-api` also drops `cloudflare-docs`).

## Practical takeaway

- User-scope servers: script them with `claude mcp remove <name> --scope user` (best-effort, wrapped in `|| true`).
- Plugin servers: accept them, or disable the whole plugin (see [scripts/extensions/plugins/disable.sh](../../scripts/extensions/plugins/disable.sh)). No per-server option.

## Related

- Underlying bug this repo works around (MCP writes to `~/.claude.json` instead of `$CLAUDE_CONFIG_DIR/.claude.json`): https://github.com/anthropics/claude-code/issues/11085
