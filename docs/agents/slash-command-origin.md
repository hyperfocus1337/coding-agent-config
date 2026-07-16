# Where did a slash command come from

When two things share a name, or a command behaves differently than the file you edited, you need to know which source actually got loaded. [`skills.md`](skills.md) maps the four channels a skill is installed through; this page is the runtime counterpart, how to trace a live `/command` back to its origin, from quickest glance to most definitive.

## Read the name first

The naming already encodes most of the origin, so start here before running anything:

| Form                            | Origin                                                                  |
|---------------------------------|-------------------------------------------------------------------------|
| `/compact`, `/context`, `/help` | built-in                                                                |
| `/foo`                          | a plain command or skill in `.claude/` (project) or `~/.claude/` (user) |
| `/frontend:foo`                 | a nested subdirectory namespace, e.g. `commands/frontend/foo.md`        |
| `/my-plugin:foo`                | provided by the plugin `my-plugin`                                      |
| `/mcp__server__prompt`          | an MCP server prompt, not a file at all                                 |

Plugin skills and commands are namespaced by the plugin name, so anything with a `something:` prefix is either a plugin or a subdirectory, never a bare user or project command.

## The picker and `/help`

Type `/` and read the picker: each entry shows its description and namespace, and plugin-provided ones sort under the plugin namespace. `/help` prints the full list the same way. This is usually enough to answer "is this mine, or did a plugin drop it in" without touching the shell.

## Grep the load paths

The definitive answer. Search every place commands and skills load from, both the new skills format and the legacy commands format, across user and project scope:

```bash
CMD=your-command

rg -l "$CMD" ~/.claude/skills ~/.claude/commands ./.claude/skills ./.claude/commands ~/.claude/plugins 2>/dev/null

# or list everything and eyeball it
fd . ~/.claude/commands ~/.claude/skills ./.claude/commands ./.claude/skills -e md
```

Scope matters for precedence. Project commands live in `.claude/commands/` and are only available in the current repo; personal commands live in `~/.claude/commands/` and are available everywhere. Both of those directories are the legacy format. The recommended location is `.claude/skills/<name>/SKILL.md`, which supports the same slash invocation plus autonomous invocation by Claude.

If you have set `CLAUDE_CONFIG_DIR`, `~/.claude` is not your real user scope, so search that path instead.

## Plugins specifically

Start with the `/plugin` picker for installed plugins and marketplaces. To find the files on disk, note the layout: installed plugins are unpacked under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, with `commands/` and `skills/` inside. The manifest `~/.claude/plugins/installed_plugins.json` maps each plugin to its install path and is the source of truth:

```bash
# what is installed, and where each version lives (column -t aligns the two fields)
jq -r '.plugins | to_entries[] | "\(.key)\t\(.value[0].installPath)"' ~/.claude/plugins/installed_plugins.json | column -t

# every command/skill dir any installed plugin ships
find ~/.claude/plugins/cache -maxdepth 4 -type d \( -name commands -o -name skills \)

# which plugin provides a specific command (swap your-command); searches both commands/ and skills/, since a /command can be either
find ~/.claude/plugins/cache \( -path '*/commands/*your-command*' -o -path '*/skills/*your-command*' \)
```

Several versions of the same plugin may sit side by side in the cache, so expect more than one hit; the active one is whichever `installed_plugins.json` points at.

These `find` and `jq` calls run identically in bash and fish: their paths are literal, so no wildcard expansion happens in the shell (`find`'s own `*` patterns are quoted). The earlier `rg` and `fd` blocks are fish-safe for the same reason. The one form that breaks in fish is a shell glob in a path, `ls ~/foo/*/bar`, because fish aborts on a zero-match wildcard (`No matches for wildcard`); reach for `find` whenever you would have written a `*` in a path.

Also check `enabledPlugins` and any marketplace entries in `.claude/settings.json` and `~/.claude/settings.json`. If you launched with `--plugin-dir`, that path is the source. In this repo, the installed plugin set is declared in [`scripts/extensions/plugins/install.sh`](../../scripts/extensions/plugins/install.sh).

## Startup debug

The nuclear option, when precedence is still ambiguous:

```bash
claude --debug 2>&1 | grep -i -E "command|skill|plugin"
```

This prints the actual load order and paths as they are discovered, which settles questions like project shadowing user.

## Precedence

When two things share a name: built-ins win over user and project files, and namespacing is what keeps plugins from colliding at all. Project scope shadows user scope for same-named bare commands, confirm with the startup debug output above.
