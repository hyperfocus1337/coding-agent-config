# Settings

`settings.json.tmpl` renders to `~/.claude/settings.json`, the user-scope settings file. Claude Code merges it with project settings (`.claude/settings.json`), local settings (`.claude/settings.local.json`), and managed policy, so a project can override any value here. The `$schema` key points at the published JSON Schema, which gives completion and validation in the editor. The file is a chezmoi template only for `permissions.defaultMode`. The template uses backtick strings, so the source stays valid JSON and `jq` can read it.

| Setting                                | Value                         | Effect                                                                                                                                                                                                                   |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `model`                                | `opus`                        | Opus with the default context window.                                                                                                                                                                                    |
| `permissions.defaultMode`              | `auto` or `bypassPermissions` | On the host, sessions start in auto mode: a classifier approves or blocks each tool call. In the devcontainer (`/.dockerenv` exists or `DEVCONTAINER` is set at apply time), sessions start with permission prompts off. |
| `skipDangerousModePermissionPrompt`    | `true`                        | Records that the bypass-permissions warning dialog is accepted, so it does not appear at startup.                                                                                                                        |
| `skipAutoPermissionPrompt`             | `true`                        | Records that the auto-mode opt-in dialog is accepted.                                                                                                                                                                    |
| `alwaysThinkingEnabled`                | `true`                        | Thinking runs automatically on models that support it.                                                                                                                                                                   |
| `autoCompactWindow`                    | `250000`                      | Auto-compact starts at 250k tokens instead of the default. The accepted range is 100,000 to 1,000,000 tokens, capped to the model context limit.                                                                         |
| `attribution.commit`, `attribution.pr` | `""`                          | An empty string hides the Claude Code attribution. The model can still write the trailer itself; `hooks/block-commit-attribution` blocks that commit.                                                                    |
| `attribution.sessionUrl`               | `false`                       | No session link in commit messages or pull request bodies.                                                                                                                                                               |
| `tui`                                  | `fullscreen`                  | The alternate-screen renderer: no flicker, virtualized scrollback, click to move the cursor, automatic copy on select. Equivalent to `CLAUDE_CODE_NO_FLICKER=1`.                                                         |
| `theme`                                | `auto`                        | Follows the terminal light or dark setting.                                                                                                                                                                              |
| `env.ENABLE_LSP_TOOL`                  | `"1"`                         | Enables the LSP tool, which [`rules/tools.md`](../rules/tools.md) requires for code navigation.                                                                                                                          |
| `env.ENABLE_PROMPT_CACHING_1H`         | `"1"`                         | Raises the prompt cache time to live from 5 minutes to 1 hour. See the trade-off below.                                                                                                                                  |

Three keys hold lists that this file does not repeat, because the list changes and the detail lives next to the thing it configures:

- `hooks` maps tool lifecycle events to shell commands, with a timeout per command. See [`hooks/README.md`](../hooks/README.md).
- `enabledPlugins` and `extraKnownMarketplaces` register plugin marketplaces and switch individual plugins on or off. Manage them with `/plugin`, not by hand.
- `statusLine` runs the status line command. See [Status line](#status-line) below.

`settings-minimal.json` and `settings-vanilla.json` are the layers that the shell functions add. See [`launch-modes.md`](launch-modes.md).

## The 1-hour prompt cache trade-off

`ENABLE_PROMPT_CACHING_1H` is not free. It doubles the price of a cache write: 2x the base input price against 1.25x for the default 5-minute cache. A read still costs 0.1x either way. So the 5-minute cache pays for itself on the second request and the 1-hour cache needs a third.

The setting wins on interactive work, where gaps between turns are often longer than 5 minutes and would otherwise expire the entry. It loses on short bursts of back-to-back turns, and in any session that keeps invalidating the front of the prompt, because each invalidation is a fresh write at the higher price.

For the arithmetic, what counts as a write, and what invalidates the prompt prefix, see [`docs/research/context/prompt-cache-ttl.md`](../../docs/research/context/prompt-cache-ttl.md).

## Status line

The status line is rendered by [ccstatusline](https://github.com/sirmalloc/ccstatusline), invoked from the `statusLine` block in `settings.json` as `npx -y ccstatusline@latest` and refreshed every 10 seconds. Claude Code pipes session context (cwd, model, git, and so on) to it on stdin.

Run `npx ccstatusline@latest` with no flags for the interactive TUI that picks widgets, colours, and ordering. Choices persist to `~/.config/ccstatusline/settings.json`, which this repo tracks in [`dot_config/ccstatusline/`](../../dot_config/ccstatusline/), and are picked up on the next refresh.

The separator glyphs need a Powerline-patched font. The setup flow installs [Powerline fonts](https://github.com/powerline/fonts); set your terminal to one of them afterwards, for example `Meslo LG M for Powerline`. Requires Node on `$PATH`.
