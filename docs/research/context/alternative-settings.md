# Alternative settings

By default, a `claude` session loads `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, and `~/.claude/rules/`. Four mechanisms start a session with other settings, and they differ in how much of that default configuration they remove: from a few overridden keys to a fully separate profile.

Checked 2026-09-27 against Claude Code 2.1.283 (`claude --help`) and the [settings documentation](https://code.claude.com/docs/en/settings#settings-precedence).

## Options

| Goal                                             | Command                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Keep the default settings and override some keys | `claude --settings ~/alt-settings.json`                                 |
| Replace the user settings with a different file  | `claude --setting-sources project,local --settings ~/alt-settings.json` |
| Use a separate, persistent configuration         | `CLAUDE_CONFIG_DIR=~/.claude-alt claude`                                |
| Turn off all customizations for one session      | `claude --safe-mode` or `claude --bare`                                 |

## `--settings`

`--settings <file-or-json>` adds a settings layer on top of the settings files instead of replacing them. The layer sits above user, project, and local settings and below managed settings, so a key that it sets wins over the same key in a lower file, and a key that it does not set keeps its lower value. The flag also accepts inline JSON, for example `claude --settings '{"model":"sonnet"}'`.

List keys such as `permissions.deny` do not follow this rule: Claude Code combines the lists from all files. Because of this, `--settings` can add entries to a list but cannot remove an entry that `~/.claude/settings.json` adds.

## `--setting-sources`

`--setting-sources` selects which settings sources to load, from `user`, `project`, and `local`. When you leave out `user`, the session ignores `~/.claude/settings.json`, while managed settings and `--settings` still apply. Together, `--setting-sources project,local --settings <file>` replaces the user settings with a different file for one session.

Leaving out `user` also removes `~/.claude/CLAUDE.md` and `~/.claude/rules/` from the session. To test this, a `claude -p` session with Haiku was asked if its instructions mention ASD-STE100, a term that only `~/.claude/rules/writing.md` contains:

| Flags                             | Answer |
| --------------------------------- | ------ |
| None                              | Yes    |
| `--setting-sources project,local` | No     |
| `--safe-mode`                     | No     |

## `CLAUDE_CONFIG_DIR`

`CLAUDE_CONFIG_DIR` sets the directory that Claude Code uses in place of `~/.claude`. That directory has its own `settings.json`, `CLAUDE.md`, `rules/`, plugins, history, memory, and credentials. On Linux the login is in `.credentials.json` in the same directory, so a new directory needs a new login or a copy of `~/.claude/.credentials.json`.

This is the best option for a second profile that you use often. In this repository, a second chezmoi source directory such as `dot_claude-alt/` can hold that profile, and a shell alias or a `just` recipe can start it.

## `--safe-mode` and `--bare`

Both flags apply to one session and have different purposes. `--safe-mode` is for troubleshooting a broken configuration. It turns off CLAUDE.md, skills, installed plugins, hooks, MCP servers, custom commands and agents, output styles, workflows, themes, and keybindings, while the login, model selection, built-in tools, permissions, and managed settings work normally.

`--bare` is for scripts and tests that need a minimal session. It skips hooks, LSP, plugin sync, attribution, auto-memory, background prefetches, and CLAUDE.md discovery. It also does not read OAuth credentials or the keychain, so it works only with `ANTHROPIC_API_KEY` or with an `apiKeyHelper` that you pass through `--settings`, and not with a subscription login.
