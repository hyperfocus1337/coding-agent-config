# Settings

[Agent directory](../README.md)

[`modify_settings.json`](../modify_settings.json) is the chezmoi modify script for `~/.pi/agent/settings.json`.

| Setting                         | Value                                                                                                                                                                                                                                                                                                 | Effect                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `defaultProvider`               | `openai`                                                                                                                                                                                                                                                                                              | Provider for a new session.                                                                            |
| `defaultModel`                  | `gpt-6-sol`                                                                                                                                                                                                                                                                                           | Model for a new session.                                                                               |
| `enabledModels`                 | three OpenRouter models and `openai/gpt-6-sol`                                                                                                                                                                                                                                                        | The models offered in the picker. pi writes this key itself, see [Settings drift](#settings-drift).    |
| `theme`                         | `light`                                                                                                                                                                                                                                                                                               |                                                                                                        |
| `hideThinkingBlock`             | `true`                                                                                                                                                                                                                                                                                                | Thinking is not rendered in the transcript.                                                            |
| `terminal.showTerminalProgress` | `true`                                                                                                                                                                                                                                                                                                | Progress in the terminal title.                                                                        |
| `packages`                      | `pi-web-access`, `pi-footer`, `pi-context-view`, `@juicesharp/rpiv-ask-user-question`                                                                                                                                                                                                                 | Web tools, the three-line footer, the context viewer, and structured questions.                        |
| `skills`                        | `["~/.claude/skills", "!../../.claude/skills/synced/**"]`                                                                                                                                                                                                                                             | The Claude Code skills, minus the claude.ai cache. See [skills](claude-resources.md#the-skills-array). |
| `extensions`                    | `["~/.claude/hooks/block-destructive-commands/pi.ts", "~/.claude/hooks/enforce-cli-tools/pi.ts", "~/.claude/hooks/lint-code/pi.ts", "~/.claude/hooks/format-code/pi.ts", "~/.claude/hooks/type-check-code/pi.ts", "~/.claude/hooks/track-session-changes/pi.ts", "~/.claude/hooks/lint-prose/pi.ts"]` | The `pi.ts` of each hook that has moved to TypeScript. Remove a line to turn that hook off in pi.      |

The extensions in [`extensions/`](../extensions/README.md) need no entry: `~/.pi/agent/extensions/*/index.ts` is a path pi scans on its own. A hook's `pi.ts` needs one, because pi resolves the imports of a linked file from the link's folder, not from the hook folder.

## Settings drift

### Changes made by pi

pi writes to `~/.pi/agent/settings.json` itself: a model change in the TUI updates `defaultModel` and `enabledModels`, and pi adds `deviceId` and `lastChangelogVersion`.

### Merge behavior

`modify_settings.json` is a chezmoi modify script, so `chezmoi apply` does not stop to ask. It merges the repository keys over the current file with `jq`: a repository key wins, and a key the repository leaves out, such as `deviceId`, stays. Objects merge key by key, and a repository array replaces the current one. To keep a model change, add it to `modify_settings.json`; the next apply resets it otherwise.

## File removal

`chezmoi apply` adds and updates but does not remove. A file deleted from this directory, or from `dot_claude/`, stays installed until it is removed from `$HOME` by hand.
