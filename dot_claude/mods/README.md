# mods

Mods are Claude Code plugins that change Claude's own interface or behaviour: a pane, a band above the prompt, a slash command, a hook on tool calls. Each one is a directory with `.claude-plugin/plugin.json` and a hooks module under `hooks/`.

This directory is a local marketplace named `local-mods`. `settings.json.tmpl` registers it in `extraKnownMarketplaces` as a `directory` source at `~/.claude/mods` and switches each mod on in `enabledPlugins`. `claude plugin install` also keeps a copy per version under `~/.claude/plugins/cache/local-mods/`. `claude plugin list` reports that a mod is read from `~/.claude/mods`, but a session kept the old code after an edit, a `/reload-plugins` and a restart. Bump the version for each edit, so the copy is refreshed too.

| Mod                                 | Description                                                                   | Source                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`replay-theater`](replay-theater/) | Step through the file edits Claude made in the last turn, one diff at a time. | [claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/replay-theater) |

## Add a mod

1. Copy the mod into `<name>/`. chezmoi needs a `dot_` prefix for each name that starts with a dot: `.claude-plugin/` becomes `dot_claude-plugin/`. Leave out the mod's `.gitignore` and its `.claude-plugin/types/`, which Claude Code writes on each load.
2. Add an entry to `dot_claude-plugin/marketplace.json` with `"source": "./<name>"`.
3. Add `"<name>@local-mods": true` to `enabledPlugins` in `settings.json.tmpl`.
4. Run `just chezmoi-all`, then `claude plugin validate ~/.claude/mods/<name>`, then `claude plugin install <name>@local-mods --scope user`. Restart Claude Code.

To change a mod, edit it, bump `version` in its `dot_claude-plugin/plugin.json`, run `just chezmoi-all`, then `claude plugin update <name>@local-mods`, and restart Claude Code.

The `claude plugin` commands reorder the keys in `~/.claude/settings.json`; after you check with `chezmoi diff` that only the order changed, restore it with `chezmoi apply --force ~/.claude/settings.json`.

`.chezmoiignore` keeps each mod's `README.md` and `test/` in the repo only. `claude plugin test` needs a folder with `.claude-plugin/`, so run a mod's tests on a copy of the applied mod:

```bash
t=$(mktemp -d) && rsync -a ~/.claude/mods/<name>/ "$t/" && rsync -a dot_claude/mods/<name>/test/ "$t/test/" && claude plugin test "$t"
```
