# Sharing skills, instructions, and hooks between Claude Code and Codex

Measured 2026-09-19 with Claude Code 2.1.278 and Codex CLI 0.154.0, both installed in this container. Every claim below is either a probe result or a string read out of the shipped binary. The earlier version of this page described Codex as a harness with no hooks, no plugin format of its own, and no way to read Claude content. All three statements are now wrong.

## The short answer

Codex moved toward Claude Code, not the other way around. Codex 0.154.0 runs lifecycle hooks with Claude's payload and Claude's tool names, and it loads plugins written in Claude's `.claude-plugin/` format. Claude Code 2.1.278 reads `AGENTS.md` when the new `instructionFiles` setting allows it, and it follows a directory symlink for skills.

So one copy of each resource is possible today:

- Instructions: one `AGENTS.md`. Claude needs `instructionFiles` set.
- Skills: one `.agents/skills/` tree. Codex reads it natively, Claude reaches it through one symlink.
- Hooks: one set of scripts, wired twice. Bash hooks port unmodified. File hooks need a shim, because Codex edits files with `apply_patch` and sends no `file_path`.
- Commands and rules: Claude only. Convert the ones worth sharing into skills.

## Where each tool looks

| Thing        | Claude Code 2.1.278                                                                                               | Codex 0.154.0                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Instructions | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`; `AGENTS.md` and `.claude/AGENTS.md` under `instructionFiles` | `AGENTS.md` in every directory from cwd up to the repo root, plus `~/.codex/AGENTS.md`                                    |
| Skills       | `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/`, plugins                                                    | `.agents/skills/` from cwd up to the repo root, `~/.agents/skills/`, `$CODEX_HOME/skills/`, `/etc/codex/skills/`, plugins |
| Commands     | `.claude/commands/*.md`, `~/.claude/commands/`                                                                    | `$CODEX_HOME/prompts/*.md`, user scope only                                                                               |
| Rules        | `.claude/rules/*.md`, `paths:` frontmatter                                                                        | no equivalent; the `.rules` files behind `--ignore-rules` are execpolicy, not instructions                                |
| Hooks        | `hooks` block in `settings.json`, plugin `hooks/hooks.json`                                                       | `~/.codex/hooks.json`, `<repo>/.codex/hooks.json`, `[hooks]` in `config.toml`, plugin `hooks/hooks.json`                  |
| Plugins      | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`                                                   | reads `.codex-plugin/`, `.claude-plugin/`, and `.cursor-plugin/` manifests                                                |
| Config       | `.claude/settings.json`                                                                                           | `~/.codex/config.toml`, `<repo>/.codex/config.toml`                                                                       |

## What was measured

Claude probes put a unique token in a resource and asked `claude -p --model haiku` to report it. Codex probes ran `codex exec`, or `codex debug prompt-input`, which renders the model-visible prompt without spending a turn. Fixtures are in the session scratchpad.

### Claude Code

| Probe                                                         | Result             |
| ------------------------------------------------------------- | ------------------ |
| `AGENTS.md` in the project root, no setting, no `CLAUDE.md`   | **not loaded**     |
| Same, with `instructionFiles: "claude-md-or-agents-md"`       | loaded             |
| Same, with `instructionFiles: "claude-md-and-agents-md"`      | loaded             |
| Project skill in `.agents/skills/<name>/SKILL.md`, no symlink | **not discovered** |
| Same skill through `.claude/skills` → `../.agents/skills`     | discovered         |

`instructionFiles` takes `claude-md`, `claude-md-or-agents-md`, `claude-md-and-agents-md`, and `managed-only`. The binary carries `claude-md-or-agents-md` as its default, but the probe with no setting did not load `AGENTS.md`, so set the value explicitly instead of relying on the default. An older `projectInstructions` key is still read and logs a message that asks you to move to `instructionFiles`. The scanned names are `AGENTS.md` and `.claude/AGENTS.md`, walking up from cwd.

Correction, measured 2026-09-26 on Claude Code 2.1.283 with tools disabled: `instructionFiles` is an option of the built-in `agents-md@builtin` plugin, set as `pluginConfigs."agents-md@builtin".options.instructionFiles`. A top-level `instructionFiles` key has no effect. With no option, a project without `CLAUDE.md` loads its `AGENTS.md`, as the default `claude-md-or-agents-md` says. With the option set to `claude-md`, it does not.

There is still no setting that adds a skills directory. `skillsPath` and `skillsPaths` exist only inside a plugin manifest. [#18621](https://github.com/anthropics/claude-code/issues/18621) is still closed `not planned`. The filesystem is still the only lever, but it now costs one symlink per directory, not one per skill.

### Codex

| Probe                                                                                             | Result                                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Project skill in `.agents/skills/<name>/SKILL.md`                                                 | discovered                                                         |
| `~/.agents/skills` as a symlink to `~/.claude/skills`                                             | discovered                                                         |
| `AGENTS.md` in the project root                                                                   | loaded                                                             |
| `[[skills.config]]` with `path` pointing at another skills root                                   | **no new skills**; the entry selects one known skill               |
| Inline `[hooks]` `PreToolUse` handler on a shell call                                             | ran                                                                |
| Repo hook `enforce-cli-tools/hook.sh`, unmodified, against `npm install lodash`                   | blocked the call, printed its own message                          |
| `PostToolUse` on a file write                                                                     | `tool_name` is `apply_patch`, `tool_input.command` holds the patch |
| Local marketplace in `.claude-plugin/marketplace.json` with a `.claude-plugin/plugin.json` plugin | added, installed, its skill reached the prompt                     |
| `.codex/hooks.json` in the project, hooks not yet trusted                                         | **did not run**                                                    |

The PreToolUse payload Codex writes to hook stdin is Claude's payload:

```json
{
  "session_id": "…",
  "turn_id": "…",
  "transcript_path": "…",
  "cwd": "…",
  "hook_event_name": "PreToolUse",
  "model": "…",
  "permission_mode": "bypassPermissions",
  "tool_name": "Bash",
  "tool_input": { "command": "echo hook-probe-2" },
  "tool_use_id": "…"
}
```

Codex hook events: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`. A handler entry takes `matcher`, `command`, `timeout`, `async`, and `statusMessage`; handler types are `command`, `mcp_tool`, `prompt`, and `agent`. Plugins get `CLAUDE_PLUGIN_ROOT` as well as `PLUGIN_ROOT`.

## What each resource type needs

**Instructions.** One `AGENTS.md` per repo. Codex reads it natively. Claude reads it once `instructionFiles` is set, so the `CLAUDE.md` symlink is no longer required at project scope. User scope still needs links, because the three tools use three names: the real file at `~/.agents/AGENTS.md`, with `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` pointing at it.

**Skills.** Keep the real tree in `.agents/skills/` and `~/.agents/skills/`. That is Codex's native path and pi's native path. Claude reaches both through one directory symlink per scope, measured working. Codex follows symlinks when it scans, so the reverse layout works too, with the real tree under `.claude/skills/`. Frontmatter is compatible: both require `name` and `description`.

**Hooks.** Share the scripts, duplicate the wiring. Claude keeps its `hooks` block in `settings.json`; Codex needs the same events in `hooks.json` or a `[hooks]` table. Two gaps to plan for:

- File hooks fire only partly. Codex edits through `apply_patch` and puts the patch text in `tool_input.command`, with no `file_path`. `format-all-languages`, `format-org-tables`, and `lint-all-languages` then take their Bash branch: lint reads the paths out of the patch text, but format-all-languages formats markdown only. [`dot_codex/hooks/apply-patch.sh`](../../../dot_codex/hooks/apply-patch.sh) closes this. It parses the `*** Add File:`, `*** Update File:`, and `*** Move to:` lines and runs the hook once per file with a Write payload. Measured 2026-09-26 with one `codex exec` turn: the `apply_patch` matcher fires, prettier rewrote the file, and the exit-2 yamllint error reached the model. `type-check-all-languages` is unaffected: it runs on `Stop`, which Codex has with `stop_hook_active`, and reads its file list from git. Codex also has no `PostToolUseFailure`, so under Codex the two formatting hooks lose their pass over a command that writes a file and then exits non-zero.
- Hooks need trust. A hook stays inert until it is enabled and its hash is persisted in `hooks.state`. The TUI does this. Automation needs `--dangerously-bypass-hook-trust`. The hash covers the `hooks.json` entry, not the script: `hooks/list` on `codex app-server` returned the same `currentHash` after both scripts were edited. A script edit needs no new trust; a change to the command string, matcher, or timeout does.

`block-secret-commits` and `enforce-cli-tools` need neither change: they match on `Bash`, which is the name Codex sends, and they read `tool_input.command`.

**Commands.** Still the worst fit. Codex prompts are user scope only, under `$CODEX_HOME/prompts/`, with no namespace. Codex's own importer converts Claude commands into skills, which is the honest signal: promote a command to a skill if it must work in both, and leave the rest Claude-only.

**Rules.** Claude-only. An unscoped rule can be pasted into `AGENTS.md`. A rule with `paths:` frontmatter has no Codex counterpart, and no hook event reproduces it, because Codex has no injection point for extra context on a file read.

**Plugins as the single artifact.** Codex reads `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. A plugin holding skills therefore installs in both harnesses from one source, measured end to end with a local marketplace. Two caveats: Claude namespaces plugin commands as `/plugin:command`, and plugin-bundled `hooks/hooks.json` firing under Codex was not measured.

## Import is a copy, not a shared source

Both tools now ship a one-time migration. Codex `/import` reads Claude Code settings, skills, `CLAUDE.md`, MCP servers, plugins, commands, subagents, and sessions. Claude has the mirror path for Codex `config.toml`, `AGENTS.md`, prompts, and subagents, and it reports what it cannot map, for example "Hook event names differ between Codex and Claude Code". Use either to seed a new machine. Neither keeps two trees in step, so neither answers the question this page asks.

## Recommendation for this repo

This recommendation was written against a shared `.agents/` layout that was later dropped: on 2026-09-19 the content stayed under `dot_claude/` and pi was pointed at `~/.claude` directly, see [`../../agents/pi.md`](../../agents/pi.md). The steps below still assume `.agents/`. Codex fits that layout without change, because `.agents/skills/` is Codex's native skills path and `AGENTS.md` is its native instruction file. Codex needs no adapter extension, unlike pi: hooks are native and the payload already matches.

Order of work, on top of the pi plan:

1. Set `pluginConfigs."agents-md@builtin".options.instructionFiles` to `claude-md-and-agents-md` in `dot_claude/settings.json`. This is now the cheapest half of the sharing problem.
2. Done differently: [`dot_codex/AGENTS.md.tmpl`](../../../dot_codex/AGENTS.md.tmpl) renders `~/.codex/AGENTS.md` from `CLAUDE.md` and the rules, because a link to `CLAUDE.md` alone gives Codex no rules.
3. Done: [`dot_codex/hooks.json`](../../../dot_codex/hooks.json) wires every hook to the scripts in `~/.claude/hooks/`, the file hooks on `apply_patch` through the shim. Trust them once in the TUI.

The old recommendation, "lean on the codex plugin and stay in one harness", no longer matches the repo: `codex@openai-codex` is set to `false` in `dot_claude/settings.json`, and Codex is installed as a peer CLI. Treat the plugin as a delegation convenience, not as the answer to sharing.
