# Claude Code configuration in Codex

A [Codex CLI](https://developers.openai.com/codex/cli) session loads the user-scope configuration from this repository's single copy: `~/.claude/skills`, the scripts in `~/.claude/hooks`, and `CLAUDE.md` with the rules in `~/.claude/rules/`. Symlinks, one hooks file, one wrapper script, and one chezmoi template do it. No hook script or rule moves or changes. The Codex-only `claude-command` skill reads a selected Claude command on demand. Written against Codex CLI 0.160.1.

| Resource                         | How Codex loads it                                                                           | Where                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Skills                           | its native user skills directory, a chezmoi symlink `~/.agents/skills` to `~/.claude/skills` | [`dot_agents/symlink_skills`](../../dot_agents/symlink_skills)                               |
| Hooks                            | `~/.codex/hooks.json`, which calls the scripts in `~/.claude/hooks/`                         | [`dot_codex/modify_hooks.json`](../../dot_codex/modify_hooks.json)                           |
| File hooks on `apply_patch`      | a wrapper that runs a file hook once per patched file                                        | [`dot_codex/hooks/apply-patch.sh`](../../dot_codex/hooks/apply-patch.sh)                     |
| `CLAUDE.md` and rules            | `~/.codex/AGENTS.md`, rendered from `CLAUDE.md` and every rule                               | [`dot_codex/AGENTS.md.tmpl`](../../dot_codex/AGENTS.md.tmpl)                                 |
| Project rules of this repository | `CODEX.md` at the repository root, a configured fallback symlink to `.claude/rules/apply.md` | [`CODEX.md`](../../CODEX.md)                                                                 |
| Commands                         | an explicit-only adapter skill in `~/.codex/skills/claude-command/`                          | [`dot_codex/skills/claude-command/SKILL.md`](../../dot_codex/skills/claude-command/SKILL.md) |

## Skills

`dot_agents/symlink_skills` holds `../.claude/skills`, a path relative to the link. Codex follows the link and registers every `SKILL.md` unchanged. In the TUI, type `$` to pick a skill.

Codex scans subdirectories and has no exclude setting, so it also lists `~/.claude/skills/synced/`, the claude.ai cache Claude Code keeps per organisation, once per organisation. A `[[skills.config]]` entry with `enabled = false` disables one exact `SKILL.md` path, not a directory, so the duplicates are accepted. pi also reads `~/.agents/skills`, but it drops a skill it already loaded through another path, so pi shows no duplicates.

### Claude commands in Codex

Type `$claude-command git:commit:single` or `$claude-command /git:changelog week`. The adapter reads only the selected file from `~/.claude/commands`, preserves its arguments, runs its shell context blocks, and maps Claude tool names to Codex actions. Nested command invocations use the same lookup. It stops if a required capability is unavailable or a routing cycle occurs.

chezmoi deploys the adapter from `dot_codex/skills/claude-command/` to `~/.codex/skills/claude-command/`, which Codex scans natively. It does not enter the shared `~/.agents/skills` directory. `agents/openai.yaml` disables implicit invocation. Claude tool permissions do not become Codex permissions, and adaptation is performed by the model, not by a Claude command parser. Individual commands do not appear as slash-menu entries.

The lookup code lives in the skill's `scripts/read-command.py`. Run `python3 dot_codex/skills/claude-command/test/read-command.py` from the repository root to check command-name validation, argument count, missing files, symlink escapes, and the explicit-only policy.

## Instructions

Codex reads `~/.codex/AGENTS.md` in every session and `AGENTS.md` files from the repository root down to the working directory. It follows symlinks for both. It has no rules directory and does not open files that an instruction file links to.

- **User scope.** chezmoi renders `dot_codex/AGENTS.md.tmpl` to `~/.codex/AGENTS.md`: `CLAUDE.md`, then each rule in `dot_claude/rules/` except `README.md`. A new rule file needs no template change. A rule with frontmatter is skipped, because Codex has no counterpart to `paths:` scoping. A rule edit reaches Codex on the next `just chezmoi`. The output is 4.4 KB; Codex's default limit is 32 KiB (`project_doc_max_bytes`).
- **This repository.** `CODEX.md` at the repository root is a symlink to `.claude/rules/apply.md`. The global Codex configuration sets `project_doc_fallback_filenames = ["CODEX.md"]`. Codex checks `AGENTS.override.md`, then `AGENTS.md`, then the fallback, so normal instruction discovery in other repositories is unchanged. `.chezmoiignore` lists `CODEX.md`, so chezmoi does not create `~/CODEX.md`. Pi does not discover `CODEX.md` as an instruction file and loads the rule only through `.claude/rules/`. Claude Code also loads the rule through that directory. With a second project rule, replace the symlink with generated content that combines the unscoped rules. Fallback entries must be filenames, not paths into `.codex/`.

Some lines in `tools.md` name things Codex does not have: the Grep and Glob tools, LSP, and Context7. Codex skips them.

## Hooks

Codex sends Claude's hook payload with Claude's tool name `Bash`, so the scripts run unchanged. `hooks.json` has the same entries as the `hooks` block in [`dot_claude/settings.json.tmpl`](../../dot_claude/settings.json.tmpl):

| Event         | Matcher       | Hooks                                                                               |
| ------------- | ------------- | ----------------------------------------------------------------------------------- |
| `PreToolUse`  | `Bash`        | `block-secret-commits`, `enforce-cli-tools`                                         |
| `PostToolUse` | `Bash`        | `format-all-languages`, `format-org-tables`, `lint-all-languages`                   |
| `PostToolUse` | `apply_patch` | the same three and `lint-prose`, through `apply-patch.sh`                           |
| `Stop`        |               | `type-check-all-languages`; Codex sends `stop_hook_active`, so the loop guard works |

Codex has no `PostToolUseFailure` event. Under Codex, the file hooks do not run after a Bash command that writes a file and then exits non-zero.

### cmux handlers

`dot_codex/modify_hooks.json` is a chezmoi modify script, not a plain file. `cmux hooks codex install` adds its own handlers to `~/.codex/hooks.json`. Each one runs a script in `~/.cmux/hooks/` whose name holds a content hash, and the hash changes when a cmux release changes the script. The repository does not track these handlers.

On each apply, the script writes the entries above and keeps every group from the current file whose handlers all run a `~/.cmux/hooks/cmux-codex-hook-*` script. It keeps them only where `~/.cmux/hooks` exists, so the devcontainer gets no cmux handlers. cmux finds its own handlers by an absolute path, so do not change these paths to `$HOME`.

### `apply_patch`

Codex edits files through `apply_patch`. Its payload holds the patch text in `tool_input.command` and has no `tool_input.file_path`. Without the wrapper, the file hooks take their Bash branch, which formats markdown only. `apply-patch.sh <hook>` reads the `*** Add File:`, `*** Update File:`, and `*** Move to:` lines, runs the hook once per file with a `Write` payload, and exits with the highest exit code. An exit code of 2 reaches the model, as under Claude Code.

### Trust

Codex runs a hook only after you trust it. Open the Codex TUI once on the host and once in the devcontainer, because each has its own `~/.codex`, and trust the hooks. The trust hash covers the entry in `hooks.json`, not the script: edit a script without new trust, but trust again after a change to a command, matcher, or timeout.

## Not loaded

- **Native Claude slash commands.** The adapter above provides explicit access, not Claude's slash-command parser or individual command-picker entries. Codex's plugin importer turns a Claude command into a skill only when the body has no `$ARGUMENTS` and no `` !`cmd` `` span.
- **Rules with `paths:` scoping.** Codex has no counterpart. The template skips them.

## Checks

- `codex debug prompt-input hi` prints the prompt Codex sends, with the skill list and the `AGENTS.md` text, and does not start a model turn.
- `codex exec --dangerously-bypass-hook-trust -s danger-full-access '<prompt>' </dev/null` runs one turn with every enabled hook, trusted or not. Without `</dev/null`, `codex exec` waits for stdin until its timeout.
- `hooks/list` on `codex app-server` returns each hook's `currentHash` and `trustStatus`.

In the devcontainer, Codex's default `workspace-write` sandbox cannot write files: `apply_patch` fails with `Failed to write file`. `-s danger-full-access` works.

## Settings

`dot_codex/modify_private_config.toml` is a chezmoi modify script for `~/.codex/config.toml`. It sets `model`, `model_reasoning_effort`, `project_doc_fallback_filenames`, `features.memories`, and the Context7 MCP server in `mcp_servers.context7`. Codex and cmux write to the same file: a trust prompt adds a `projects` entry, hook trust adds a `hooks.state` entry, the TUI adds `tui` keys, and cmux adds hook trust entries between `# cmux-… begin` and `# cmux-… end` marker comments. The script merges the repository keys over the current file: a repository key wins, and a key the repository leaves out stays. Tables merge key by key, and a repository array replaces the current one. To keep a `/model` change, add it to the script; the next apply resets it otherwise.

The script is Python with [tomlkit](https://github.com/python-poetry/tomlkit), run through `uv run --script`, so it needs `uv` on `PATH` on the host and in the devcontainer. tomlkit edits the file in place: comments, the cmux markers, key and table order, and string quoting stay, and a value already equal to the repository value is not rewritten. A parser that serializes the whole file again, such as `yq`, drops the cmux end marker and moves `[tui]` behind the cmux tables. The `private_` attribute keeps the file at mode 0600, as Codex writes it. If the script fails, `chezmoi apply` stops and does not change the file.

The script also writes `CONTEXT7_API_KEY` into `[mcp_servers.context7.env]`. Codex passes only a fixed set of variables, such as `HOME` and `PATH`, to a stdio MCP server, so the key must be in the file, as `apm` writes it for Claude. The script takes the key from the `export CONTEXT7_API_KEY=` line in `.envrc` at the repository root, which chezmoi gives as `CHEZMOI_SOURCE_DIR`. `.envrc` is in `.gitignore` and `.chezmoiignore`, so the key reaches only `~/.codex/config.toml`, at mode 0600. Without a key, the script keeps the key from an earlier apply. `chezmoi diff` prints the key when it changes.

## Out of scope

Other MCP servers, subagents, and plugins.
