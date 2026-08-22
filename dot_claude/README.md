# Portable Claude Code

Portable Claude Code configuration: instructions, commands, skills, hooks, and settings, shareable across installations.

Clone this repo and run `chezmoi apply` (or `just chezmoi` from the repo root) to render `dot_claude/` into `~/.claude`.

| Path                              | What lives there                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                       | System-wide context, loaded at the start of every session. An index of about three lines.          |
| [`rules/`](rules/README.md)       | The standing instructions themselves, one per file: writing, tools, code.                          |
| [`commands/`](commands/README.md) | Slash commands, invoked as `/<namespace>:<name>`. 30 commands in six namespaces.                   |
| [`skills/`](skills/README.md)     | On-demand skills, loaded when invoked rather than at session start. Install routing and task work. |
| [`hooks/`](hooks/README.md)       | Shell commands Claude Code runs on tool lifecycle events. One directory per hook.                  |
| `settings.json`                   | Model, permission mode, hook wiring and timeouts, enabled plugins, marketplaces, status line.      |

Each README above documents its own directory. This file only says what is where.

`CLAUDE.md` stays thin on purpose: it is an index, and the instructions live in `rules/`. Claude Code discovers that directory on its own, so `CLAUDE.md` must not import the files with `@`. An `@` import loads a rule unconditionally and bypasses its `paths:` frontmatter, which defeats the scoping. See [`rules/README.md`](rules/README.md) for the reasoning and for what belongs in a rule instead of a skill.

## Status line

The status line is rendered by [ccstatusline](https://github.com/sirmalloc/ccstatusline), invoked from the `statusLine` block in `settings.json` as `npx -y ccstatusline@latest` and refreshed every 10 seconds. Claude Code pipes session context (cwd, model, git, and so on) to it on stdin.

Run `npx ccstatusline@latest` with no flags for the interactive TUI that picks widgets, colours, and ordering. Choices persist to `~/.config/ccstatusline/settings.json`, which this repo tracks in [`dot_config/ccstatusline/`](../dot_config/ccstatusline/), and are picked up on the next refresh.

The separator glyphs need a Powerline-patched font. The setup flow installs [Powerline fonts](https://github.com/powerline/fonts); set your terminal to one of them afterwards, for example `Meslo LG M for Powerline`. Requires Node on `$PATH`.
