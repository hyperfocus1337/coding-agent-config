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
| [`settings.json`](#settings)      | Model, permission mode, hook wiring and timeouts, enabled plugins, marketplaces, status line.      |

Each README above documents its own directory. This file says what is where, and documents `settings.json` below.

`CLAUDE.md` stays thin on purpose: it is an index, and the instructions live in `rules/`. Claude Code discovers that directory on its own, so `CLAUDE.md` must not import the files with `@`. An `@` import loads a rule unconditionally and bypasses its `paths:` frontmatter, which defeats the scoping. See [`rules/README.md`](rules/README.md) for the reasoning and for what belongs in a rule instead of a skill.

## Settings

`settings.json` renders to `~/.claude/settings.json`, the user-scope settings file. Claude Code merges it with project settings (`.claude/settings.json`), local settings (`.claude/settings.local.json`), and managed policy, so a project can override any value here. The `$schema` key points at the published JSON Schema, which gives completion and validation in the editor.

| Setting                                | Value               | Effect                                                                                                                                                           |
| -------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`                                | `opus[1m]`          | Opus with the 1M-token context window.                                                                                                                           |
| `permissions.defaultMode`              | `bypassPermissions` | Every session starts with permission prompts off.                                                                                                                |
| `skipDangerousModePermissionPrompt`    | `true`              | Records that the bypass-permissions warning dialog is accepted, so it does not appear at startup.                                                                |
| `skipAutoPermissionPrompt`             | `true`              | Records that the auto-mode opt-in dialog is accepted.                                                                                                            |
| `alwaysThinkingEnabled`                | `true`              | Thinking runs automatically on models that support it.                                                                                                           |
| `autoCompactWindow`                    | `250000`            | Auto-compact starts at 250k tokens instead of the default. The accepted range is 100,000 to 1,000,000 tokens, capped to the model context limit.                 |
| `attribution.commit`, `attribution.pr` | `""`                | An empty string hides the Claude Code attribution. Commits get no trailer and pull request bodies get no footer.                                                 |
| `attribution.sessionUrl`               | `false`             | No session link in commit messages or pull request bodies.                                                                                                       |
| `tui`                                  | `fullscreen`        | The alternate-screen renderer: no flicker, virtualized scrollback, click to move the cursor, automatic copy on select. Equivalent to `CLAUDE_CODE_NO_FLICKER=1`. |
| `theme`                                | `auto`              | Follows the terminal light or dark setting.                                                                                                                      |
| `env.ENABLE_LSP_TOOL`                  | `"1"`               | Enables the LSP tool, which [`rules/tools.md`](rules/tools.md) requires for code navigation.                                                                     |
| `env.ENABLE_PROMPT_CACHING_1H`         | `"1"`               | Raises the prompt cache time to live from 5 minutes to 1 hour. See the trade-off below.                                                                          |

Three keys hold lists that this file does not repeat, because the list changes and the detail lives next to the thing it configures:

- `hooks` maps tool lifecycle events to shell commands, with a timeout per command. See [`hooks/README.md`](hooks/README.md).
- `enabledPlugins` and `extraKnownMarketplaces` register plugin marketplaces and switch individual plugins on or off. Manage them with `/plugin`, not by hand.
- `statusLine` runs the status line command. See [Status line](#status-line) below.

### The 1-hour prompt cache trade-off

`ENABLE_PROMPT_CACHING_1H` is not free. It doubles the price of a cache write: 2x the base input price against 1.25x for the default 5-minute cache. A read still costs 0.1x either way. So the 5-minute cache pays for itself on the second request and the 1-hour cache needs a third.

The setting wins on interactive work, where gaps between turns are often longer than 5 minutes and would otherwise expire the entry. It loses on short bursts of back-to-back turns, and in any session that keeps invalidating the front of the prompt, because each invalidation is a fresh write at the higher price.

For the arithmetic, what counts as a write, and what invalidates the prompt prefix, see [`docs/research/prompt-cache-ttl.md`](../docs/research/prompt-cache-ttl.md).

## Status line

The status line is rendered by [ccstatusline](https://github.com/sirmalloc/ccstatusline), invoked from the `statusLine` block in `settings.json` as `npx -y ccstatusline@latest` and refreshed every 10 seconds. Claude Code pipes session context (cwd, model, git, and so on) to it on stdin.

Run `npx ccstatusline@latest` with no flags for the interactive TUI that picks widgets, colours, and ordering. Choices persist to `~/.config/ccstatusline/settings.json`, which this repo tracks in [`dot_config/ccstatusline/`](../dot_config/ccstatusline/), and are picked up on the next refresh.

The separator glyphs need a Powerline-patched font. The setup flow installs [Powerline fonts](https://github.com/powerline/fonts); set your terminal to one of them afterwards, for example `Meslo LG M for Powerline`. Requires Node on `$PATH`.
