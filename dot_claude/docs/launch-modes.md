# Launch modes

`claude.sh` and `dot_config/fish/conf.d/claude.fish` define shell functions that start Claude Code with different settings. Fish loads the functions from `~/.config/fish/conf.d/claude.fish` with no further step. For bash or zsh, add this line to `~/.bashrc` or `~/.zshrc`:

```sh
. ~/.claude/claude.sh
```

## Modes

The table lists the functions from the most setup to the least.

| Command          | `settings.json` | `settings-minimal.json` | Hooks | CLAUDE.md and rules | Plugins and skills | MCP servers |
| ---------------- | --------------- | ----------------------- | ----- | ------------------- | ------------------ | ----------- |
| `claude-full`    | yes             | no                      | yes   | yes                 | yes                | yes         |
| `claude`         | yes             | yes                     | yes   | yes                 | yes                | yes         |
| `claude-nohooks` | yes             | yes                     | no    | yes                 | yes                | yes         |
| `claude-norules` | yes             | yes                     | no    | no                  | yes                | yes         |
| `claude-vanilla` | no              | no                      | no    | no                  | no                 | no          |

- `claude` adds `settings-minimal.json` as a `--settings` layer on top of `settings.json`. The minimal file holds the denied tools and the `disable*` keys that [`docs/research/context/disabled-tools.md`](../../docs/research/context/disabled-tools.md) explains. Use it for daily work.
- `claude-full` starts without the minimal layer, so all features are available.
- `claude-nohooks` is `claude` plus `disableAllHooks`: `jq` adds the key to `settings-minimal.json` and passes the result as inline JSON. This also turns off the status line.
- `claude-norules` is `claude-nohooks` plus `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. The variable skips every CLAUDE.md file and every `.claude/rules/` directory, at user and project scope.
- `claude-vanilla` is stock Claude Code with OAuth login. Use it to find out if a problem comes from this setup or from Claude Code itself. See [Vanilla mode](#vanilla-mode).

All modes use `~/.claude`, so they share history, sessions, memory, and login. A deny rule cannot be removed by a later settings file, so the minimal file is a layer on top of the full file and not the other way round. See [`docs/research/context/alternative-settings.md`](../../docs/research/context/alternative-settings.md).

## Switches

The functions combine the switches below. Each row shows what a session loads when you add only that switch. `--safe-mode` is built into Claude Code, and no function uses it. The functions pass other flags through, so `claude --safe-mode` also gets the `settings-minimal.json` layer.

| Switch                              | Kind         | `settings.json`            | Hooks | CLAUDE.md and rules | Plugins and skills | MCP servers          | Used by                            |
| ----------------------------------- | ------------ | -------------------------- | ----- | ------------------- | ------------------ | -------------------- | ---------------------------------- |
| `--safe-mode`                       | flag         | permissions and model only | no    | no                  | no                 | no                   | none                               |
| `--setting-sources ''`              | flag         | no                         | no    | no                  | no                 | yes                  | `claude-vanilla`                   |
| `--strict-mcp-config`               | flag         | yes                        | yes   | yes                 | yes                | no                   | `claude-vanilla`                   |
| `"disableAllHooks": true`           | settings key | yes                        | no    | yes                 | yes                | yes                  | `claude-nohooks`, `claude-norules` |
| `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`  | environment  | yes                        | yes   | no                  | yes                | yes                  | `claude-norules`, `claude-vanilla` |
| `ENABLE_CLAUDEAI_MCP_SERVERS=false` | environment  | yes                        | yes   | yes                 | yes                | no claude.ai servers | all functions except `claude-full` |

## Vanilla mode

`claude-vanilla` uses three switches:

- `--setting-sources ''` skips user, project, and local settings. Claude Code loads CLAUDE.md, rules, hooks, plugins, and user skills through these sources, so the flag skips them too. Bundled skills still load.
- `--strict-mcp-config` skips MCP servers. Without it, servers from `~/.claude.json` still load.
- `--settings ~/.claude/settings-vanilla.json` is the only settings layer. The file turns off commit and PR attribution, because in this mode no rule or hook stops Claude from adding a `Co-Authored-By` trailer. For the pure Claude Code defaults, remove the `attribution` key.

Do not use `--bare` for this mode. It reads only `ANTHROPIC_API_KEY` or an `apiKeyHelper`, so an OAuth login fails.

In the devcontainer, `claude-vanilla` does not get `bypassPermissions`, because that value comes from `settings.json`. Claude asks for permission before each action.

## Limits

- Only shells that load these functions get these modes. The IDE extension, the desktop app, and scripts that start `claude` run in full mode.
- Claude Code keeps only the last `--settings` flag, so `claude --settings X` replaces the minimal layer.
- `claude-nohooks`, `claude-norules`, and `claude-vanilla` also turn off the guardrail hooks, such as `block-secret-commits` and `block-commit-attribution`. For full mode without hooks, run `claude-full --settings '{"disableAllHooks": true}'`.
- All modes except `claude-full` set `ENABLE_CLAUDEAI_MCP_SERVERS=false`, which turns off the claude.ai MCP servers. `claude-full` removes the variable, because a `claude-full` started from a `claude` session inherits it.
