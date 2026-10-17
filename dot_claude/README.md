# Portable Claude Code

Portable Claude Code configuration: instructions, commands, skills, hooks, and settings, shareable across installations.

Clone this repo and run `chezmoi apply` (or `just chezmoi` from the repo root) to render `dot_claude/` into `~/.claude`.

| Path                                            | What lives there                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                     | System-wide context, loaded at the start of every session. An index of about three lines.          |
| [`rules/`](rules/README.md)                     | The standing instructions themselves, one per file: writing, tools, code.                          |
| [`commands/`](commands/README.md)               | Slash commands, invoked as `/<namespace>:<name>`. 30 commands in six namespaces.                   |
| [`skills/`](skills/README.md)                   | On-demand skills, loaded when invoked rather than at session start. Install routing and task work. |
| [`hooks/`](hooks/README.md)                     | Shell commands Claude Code runs on tool lifecycle events. One directory per hook.                  |
| [`mods/`](mods/README.md)                       | Mods, kept as the `local-mods` plugin marketplace. One directory per mod.                          |
| [`settings.json.tmpl`](docs/settings.md)        | Model, permission mode, hook wiring and timeouts, enabled plugins, marketplaces, status line.      |
| [`settings-minimal.json`](docs/launch-modes.md) | Denied tools and `disable*` keys, added by the `claude` shell function.                            |
| [`settings-vanilla.json`](docs/launch-modes.md) | The only settings layer of `claude-vanilla`: attribution off.                                      |
| [`claude.sh`](docs/launch-modes.md)             | The `claude*` launch mode functions for bash and zsh. Fish: `dot_config/fish/conf.d/claude.fish`.  |
| [`docs/`](#docs)                                | Reference pages for the files in this directory that have no README of their own.                  |

Each README above documents its own directory. This file says what is where.

`CLAUDE.md` stays thin on purpose: it is an index, and the instructions live in `rules/`. Claude Code discovers that directory on its own, so `CLAUDE.md` must not import the files with `@`. An `@` import loads a rule unconditionally and bypasses its `paths:` frontmatter, which defeats the scoping. See [`rules/README.md`](rules/README.md) for the reasoning and for what belongs in a rule instead of a skill.

## Docs

| File                                      | Description                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| [`settings.md`](docs/settings.md)         | Each key in `settings.json`, the 1-hour prompt cache trade-off, status line |
| [`launch-modes.md`](docs/launch-modes.md) | The `claude*` shell functions, what each one loads, and their limits        |
