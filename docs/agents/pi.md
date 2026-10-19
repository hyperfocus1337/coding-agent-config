# Claude Code configuration in pi

A [pi](https://pi.dev/) session loads the same user-scope configuration a Claude Code session loads, from this repository's single copy: `~/.claude/skills`, `~/.claude/commands`, `~/.claude/CLAUDE.md`, and `~/.claude/rules`. Two extensions, one settings line, and one symlink do it. No dependency, no build step, no second copy of any file. Written against pi 0.85.1.

| Resource    | How pi loads it                                                                                       | Where                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Skills      | pi's own `skills` setting                                                                             | [`dot_pi/agent/modify_settings.json`](../../dot_pi/agent/modify_settings.json)                        |
| Commands    | an extension that registers every command file under its namespaced name, `/git:commit:single`        | [`dot_pi/agent/extensions/claude-commands/`](../../dot_pi/agent/extensions/claude-commands/README.md) |
| Rules       | an extension that puts unscoped rules in the system prompt and sends a scoped rule on a matching read | [`dot_pi/agent/extensions/claude-rules/`](../../dot_pi/agent/extensions/claude-rules/README.md)       |
| `CLAUDE.md` | a chezmoi symlink, `~/.pi/agent/AGENTS.md` to `~/.claude/CLAUDE.md`                                   | [`dot_pi/agent/symlink_AGENTS.md`](../../dot_pi/agent/symlink_AGENTS.md)                              |

[`dot_pi/agent/README.md`](../../dot_pi/agent/README.md) documents the settings file and the symlink. Each extension directory holds a README for its behaviour and `docs/implementation.md` for its design; [`dot_pi/agent/extensions/README.md`](../../dot_pi/agent/extensions/README.md) indexes them. A third extension, [`compact-bash`](../../dot_pi/agent/extensions/compact-bash/README.md), sits beside them: it shortens pi's own `bash` output preview and carries no Claude Code behaviour, so it is not part of the table above.

## Skills

`"skills": ["~/.claude/skills", "!../../.claude/skills/synced/**"]`. pi reads the same Agent Skills standard, so every `SKILL.md` registers unchanged as `/skill:<name>`. The exclusion skips `~/.claude/skills/synced/`, the claude.ai cache Claude Code keeps per organisation, which holds duplicate skills and is not in this repository. The pattern is relative to `~/.pi/agent` because pi does not expand `~` inside a `!` pattern.

## Commands

pi's native `prompts` setting names a command by its basename alone, which drops the colliding `cleanup.md` and `push.md` files silently. The extension registers each file by its path instead, so `/git:commit:single` keeps the name Claude uses. It expands `$ARGUMENTS`, `$N`, `$name`, and `` !`cmd` `` spans, and skips `README.md`.

## Rules

Rules without `paths:` go into the system prompt at session start, as one block that does not change between turns. A rule with `paths:` is sent once per session after `read`, `write`, or `edit` touches a matching file, the same trigger Claude Code uses. Globs follow Claude's documented semantics through Node's `path.matchesGlob`.

## `CLAUDE.md`

`dot_pi/agent/symlink_AGENTS.md` holds `../../.claude/CLAUDE.md`, a path relative to the link. pi loads `~/.pi/agent/AGENTS.md` in every project, trusted or not.

## Checks

`just pi-check` type-checks every extension against the installed pi package and runs their self-checks. `just pi-apply` renders the pi tree alone, and `just pi` does both. `/reload` in a running pi picks up an edit.

## Settings drift

pi writes model choices, `deviceId`, and `lastChangelogVersion` into `~/.pi/agent/settings.json` itself. `dot_pi/agent/modify_settings.json` is a chezmoi modify script: each apply sets the repository keys and keeps the keys the repository leaves out, with no prompt. A model change in the TUI lasts until the next apply, unless you add it to the script. [`dot_pi/agent/README.md`](../../dot_pi/agent/README.md#settings-drift) has the merge rules.

## Out of scope

MCP, subagents, output styles, plan mode, todos, and memory. The hooks are not part of this setup: each hook in `dot_claude/hooks/` has its own `pi.ts`, see [`docs/hooks/`](../hooks/README.md). [`hook-events.md`](../research/hooks/hook-events.md) compares the events of pi and Claude Code.
