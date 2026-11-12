# Launch modes

`cli/claude.sh` and `dot_config/fish/conf.d/claude.fish` define shell functions that start Claude Code through the shared Bash launcher, `~/.claude/cli/launch.sh`. Fish loads the functions from `~/.config/fish/conf.d/claude.fish` with no further step. For bash or zsh, add this line to `~/.bashrc` or `~/.zshrc`:

```sh
. ~/.claude/cli/claude.sh
```

## Modes

The table lists the functions from the most setup to the least.

| Command                  | `settings.json` | `settings-minimal.json` | Hooks | CLAUDE.md and rules | Plugins and skills | MCP servers |
| ------------------------ | --------------- | ----------------------- | ----- | ------------------- | ------------------ | ----------- |
| `claude`                 | yes             | yes                     | yes   | yes                 | yes                | yes         |
| `claude-full`            | yes             | no                      | yes   | yes                 | yes                | yes         |
| `claude-nohooks`         | yes             | yes                     | no    | yes                 | yes                | yes         |
| `claude-norules`         | yes             | yes                     | yes   | no                  | yes                | yes         |
| `claude-nohooks-norules` | yes             | yes                     | no    | no                  | yes                | yes         |
| `claude-vanilla`         | no              | no                      | no    | no                  | no                 | no          |
| `claude-vanilla-minimal` | no              | yes                     | no    | no                  | no                 | no          |

- `claude` adds `settings-minimal.json` as a `--settings` layer on top of `settings.json`. The minimal file holds the denied tools and the `disable*` keys that [`docs/research/context/disabled-tools.md`](../../docs/research/context/disabled-tools.md) explains. Use it for daily work.
- `claude-full` starts without the minimal layer, so all features are available.
- `claude-nohooks` is `claude` plus `disableAllHooks`: `jq` adds the key to `settings-minimal.json` and passes the result as inline JSON. This also turns off the status line.
- `claude-norules` is `claude` plus `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. The variable skips every CLAUDE.md file and every `.claude/rules/` directory, at user and project scope. Hooks still run.
- `claude-nohooks-norules` is `claude-nohooks` plus `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`.
- `claude-vanilla` is stock Claude Code with OAuth login. Use it to find out if a problem comes from this setup or from Claude Code itself. See [Vanilla mode](#vanilla-mode).
- `claude-vanilla-minimal` is `claude-vanilla` plus the `settings-minimal.json` layer. Compare it with `claude-vanilla` to find out if a problem comes from the minimal layer.

All modes use `~/.claude`, so they share history, sessions, memory, and login. A deny rule cannot be removed by a later settings file, so the minimal file is a layer on top of the full file and not the other way round. See [`docs/research/context/alternative-settings.md`](../../docs/research/context/alternative-settings.md).

## Select user rules

Fish, Bash, and Zsh provide `claude-rules` to select a launch mode and user rules:

```fish
claude-rules --include code,writing
claude-rules --mode claude-nohooks --exclude tools -- --model sonnet
claude-rules --mode claude-full --include code,tools --exclude tools
```

| Argument          | Meaning                                    | Default            |
| ----------------- | ------------------------------------------ | ------------------ |
| `--mode NAME`     | Any command from the modes table           | `claude`           |
| `--include NAMES` | Load only these user rules                 | All user rules     |
| `--exclude NAMES` | Remove these user rules from the selection | None               |
| `--`              | Pass the remaining arguments to Claude     | No extra arguments |

Rule lists are comma-separated. Names are relative to `~/.claude/rules/`, with an optional `.md` suffix; use `nested/security` for a nested rule. Unknown names and empty lists stop the launch. If both filters are given, exclude wins. Filters affect only user rules, not project rules or CLAUDE.md files.

The selected mode keeps its settings, hooks, environment variables, and other switches. For example, full mode adds no minimal settings, and no-hooks mode keeps `disableAllHooks`. Modes that disable rules reject filters: `claude-norules`, `claude-nohooks-norules`, `claude-vanilla`, and `claude-vanilla-minimal`. Those modes work without filters.

The two shortcuts still use the default `claude` mode and take normal Claude arguments directly after the list:

```fish
claude-include-rules code,writing --model sonnet
claude-exclude-rules tools
```

The launcher merges `claudeMdExcludes` into the mode's settings for this launch without changing files. Existing exclusions still apply, including exclusions from other settings layers, so an include selection cannot restore a rule excluded elsewhere. `--settings` is rejected when filters are active, because it would replace the selection. An inherited `CLAUDE_CODE_DISABLE_CLAUDE_MDS` is not cleared.

Run the mode and filter tests with `python3 scripts/inspect/test-claude-rules.py`. Tests for shells that are not installed are skipped.

## Switches

The functions combine the switches below. Each row shows what a session loads when you add only that switch. `--safe-mode` is built into Claude Code, and no function uses it. The functions pass other flags through, so `claude --safe-mode` also gets the `settings-minimal.json` layer.

| Switch                              | Kind         | `settings.json`            | Hooks     | CLAUDE.md and rules | Plugins and skills | MCP servers          | Used by                                                                                |
| ----------------------------------- | ------------ | -------------------------- | --------- | ------------------- | ------------------ | -------------------- | -------------------------------------------------------------------------------------- |
| `--safe-mode`                       | flag         | permissions and model only | no        | no                  | no                 | no                   | none                                                                                   |
| `--setting-sources ''`              | flag         | no                         | mods only | no                  | no                 | yes                  | `claude-vanilla`, `claude-vanilla-minimal`                                             |
| `--strict-mcp-config`               | flag         | yes                        | yes       | yes                 | yes                | no                   | `claude-vanilla`, `claude-vanilla-minimal`                                             |
| `"disableAllHooks": true`           | settings key | yes                        | no        | yes                 | yes                | yes                  | `claude-nohooks`, `claude-nohooks-norules`, `claude-vanilla`, `claude-vanilla-minimal` |
| `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`  | environment  | yes                        | yes       | no                  | yes                | yes                  | `claude-norules`, `claude-nohooks-norules`, `claude-vanilla`, `claude-vanilla-minimal` |
| `ENABLE_CLAUDEAI_MCP_SERVERS=false` | environment  | yes                        | yes       | yes                 | yes                | no claude.ai servers | all functions except `claude-full`                                                     |

## Vanilla mode

`claude-vanilla` uses three switches:

- `--setting-sources ''` skips user, project, and local settings. Claude Code loads CLAUDE.md, rules, hooks, plugins, and user skills through these sources, so the flag skips them too. Bundled skills still load.
- `--strict-mcp-config` skips MCP servers. Without it, servers from `~/.claude.json` still load.
- `--settings ~/.claude/settings-vanilla.json` is the only settings layer. The file turns off commit and PR attribution, because in this mode no rule or hook stops Claude from adding a `Co-Authored-By` trailer. For the pure Claude Code defaults, remove the `attribution` key. The file also sets `disableAllHooks`, because `--setting-sources ''` does not stop the hooks that run as mods (tested on 2026-11-11).

`claude-vanilla-minimal` uses the same switches, but `jq` merges `settings-vanilla.json` over `settings-minimal.json` into one settings layer. Claude Code keeps only the last `--settings` flag, so two flags would drop the attribution keys. The vanilla file wins on conflicts, so its `"disableAllHooks": true` replaces the `false` in the minimal file. The minimal layer also turns off bundled skills.

Do not use `--bare` for this mode. It reads only `ANTHROPIC_API_KEY` or an `apiKeyHelper`, so an OAuth login fails.

In the devcontainer, `claude-vanilla` does not get `bypassPermissions`, because that value comes from `settings.json`. Claude asks for permission before each action.

## Limits

- Only shells that load these functions get these modes. The IDE extension, the desktop app, and scripts that start `claude` run in full mode.
- Without rule filters, a supplied `--settings` replaces the mode's settings layer. If repeated, the last value wins. The launcher passes one `--settings` flag to Claude.
- `claude-nohooks`, `claude-nohooks-norules`, `claude-vanilla`, and `claude-vanilla-minimal` also turn off the guardrail hooks, such as `block-destructive-commands` and `enforce-cli-tools`. This includes the hooks that run as mods (tested on 2026-10-19). The git guards `block-secret-commits` and `block-commit-attribution` still run, because git runs them on each commit. For full mode without hooks, run `claude-full --settings '{"disableAllHooks": true}'`.
- All modes except `claude-full` set `ENABLE_CLAUDEAI_MCP_SERVERS=false`, which turns off the claude.ai MCP servers. `claude-full` removes the variable, because a `claude-full` started from a `claude` session inherits it.
