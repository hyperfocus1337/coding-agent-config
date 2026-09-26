# Claude Code configuration in Codex

A [Codex CLI](https://developers.openai.com/codex/cli) session loads the user-scope configuration from this repository's single copy: `~/.claude/skills`, the scripts in `~/.claude/hooks`, and `CLAUDE.md` with the rules in `~/.claude/rules/`. Symlinks, one hooks file, one wrapper script, and one chezmoi template do it. No hook script or rule moves or changes. Commands do not reach Codex; use [pi](pi.md) when you need them. Written against Codex CLI 0.154.0.

| Resource                         | How Codex loads it                                                                           | Where                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Skills                           | its native user skills directory, a chezmoi symlink `~/.agents/skills` to `~/.claude/skills` | [`dot_agents/symlink_skills`](../../dot_agents/symlink_skills)           |
| Hooks                            | `~/.codex/hooks.json`, which calls the scripts in `~/.claude/hooks/`                         | [`dot_codex/hooks.json`](../../dot_codex/hooks.json)                     |
| File hooks on `apply_patch`      | a wrapper that runs a file hook once per patched file                                        | [`dot_codex/hooks/apply-patch.sh`](../../dot_codex/hooks/apply-patch.sh) |
| `CLAUDE.md` and rules            | `~/.codex/AGENTS.md`, rendered from `CLAUDE.md` and every rule                               | [`dot_codex/AGENTS.md.tmpl`](../../dot_codex/AGENTS.md.tmpl)             |
| Project rules of this repository | `AGENTS.md` at the repository root, a symlink to `.claude/rules/apply.md`                    | [`AGENTS.md`](../../AGENTS.md)                                           |
| Commands                         | not loaded, see [Not loaded](#not-loaded)                                                    |                                                                          |

[`codex-compat.md`](../research/agents/codex-compat.md) holds the probes behind this page.

## Skills

`dot_agents/symlink_skills` holds `../.claude/skills`, a path relative to the link. Codex follows the link and registers every `SKILL.md` unchanged. In the TUI, type `$` to pick a skill.

Codex scans subdirectories and has no exclude setting, so it also lists `~/.claude/skills/synced/`, the claude.ai cache Claude Code keeps per organisation, once per organisation. A `[[skills.config]]` entry with `enabled = false` disables one exact `SKILL.md` path, not a directory, so the duplicates are accepted. pi also reads `~/.agents/skills`, but it drops a skill it already loaded through another path, so pi shows no duplicates.

## Instructions

Codex reads `~/.codex/AGENTS.md` in every session and `AGENTS.md` files from the repository root down to the working directory. It follows symlinks for both. It has no rules directory and does not open files that an instruction file links to.

- **User scope.** chezmoi renders `dot_codex/AGENTS.md.tmpl` to `~/.codex/AGENTS.md`: `CLAUDE.md`, then each rule in `dot_claude/rules/` except `README.md`. A new rule file needs no template change. A rule with frontmatter is skipped, because Codex has no counterpart to `paths:` scoping. A rule edit reaches Codex on the next `just chezmoi`. The output is 4.4 KB; Codex's default limit is 32 KiB (`project_doc_max_bytes`).
- **This repository.** `AGENTS.md` at the repository root is a symlink to `.claude/rules/apply.md`. `.chezmoiignore` lists `AGENTS.md`, so chezmoi does not create `~/AGENTS.md`. The repository has no `CLAUDE.md`, so Claude Code would load `AGENTS.md` by default and read the rule twice. `dot_claude/settings.json` prevents this: `pluginConfigs."agents-md@builtin".options.instructionFiles` is `claude-md`. `instructionFiles` is an option of the built-in `agents-md` plugin, not a top-level setting; Claude Code 2.1.283 ignores it at the top level. With a second project rule, replace the symlink with a generated file.

Some lines in `tools.md` name things Codex does not have: the Grep and Glob tools, LSP, and Context7. Codex skips them.

## Hooks

Codex sends Claude's hook payload with Claude's tool name `Bash`, so the scripts run unchanged. `hooks.json` has the same entries as the `hooks` block in [`dot_claude/settings.json`](../../dot_claude/settings.json):

| Event         | Matcher       | Hooks                                                                               |
| ------------- | ------------- | ----------------------------------------------------------------------------------- |
| `PreToolUse`  | `Bash`        | `block-secret-commits`, `enforce-cli-tools`                                         |
| `PostToolUse` | `Bash`        | `format-all-languages`, `format-org-tables`, `lint-all-languages`                   |
| `PostToolUse` | `apply_patch` | the same three, through `apply-patch.sh`                                            |
| `Stop`        |               | `type-check-all-languages`; Codex sends `stop_hook_active`, so the loop guard works |

Codex has no `PostToolUseFailure` event. Under Codex, the file hooks do not run after a Bash command that writes a file and then exits non-zero.

### `apply_patch`

Codex edits files through `apply_patch`. Its payload holds the patch text in `tool_input.command` and has no `tool_input.file_path`. Without the wrapper, the file hooks take their Bash branch, which formats markdown only. `apply-patch.sh <hook>` reads the `*** Add File:`, `*** Update File:`, and `*** Move to:` lines, runs the hook once per file with a `Write` payload, and exits with the highest exit code. An exit code of 2 reaches the model, as under Claude Code.

### Trust

Codex runs a hook only after you trust it. Open the Codex TUI once on the host and once in the devcontainer, because each has its own `~/.codex`, and trust the hooks. The trust hash covers the entry in `hooks.json`, not the script: edit a script without new trust, but trust again after a change to a command, matcher, or timeout.

## Not loaded

- **Commands.** Codex has no user slash commands. Its plugin importer turns a Claude command into a skill only when the body has no `$ARGUMENTS` and no `` !`cmd` `` span, which is 14 of the 59 commands here. A `UserPromptSubmit` hook could expand a command, but it runs after you press Enter, so the TUI shows no command list.
- **Rules with `paths:` scoping.** Codex has no counterpart. The template skips them.

## Checks

- `codex debug prompt-input hi` prints the prompt Codex sends, with the skill list and the `AGENTS.md` text, and does not start a model turn.
- `codex exec --dangerously-bypass-hook-trust -s danger-full-access '<prompt>' </dev/null` runs one turn with every enabled hook, trusted or not. Without `</dev/null`, `codex exec` waits for stdin until its timeout.
- `hooks/list` on `codex app-server` returns each hook's `currentHash` and `trustStatus`.

In the devcontainer, Codex's default `workspace-write` sandbox cannot write files: `apply_patch` fails with `Failed to write file`. `-s danger-full-access` works.

## Out of scope

MCP servers, subagents, and plugins.
