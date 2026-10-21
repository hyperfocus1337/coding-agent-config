# pi agent directory

chezmoi renders this directory to `~/.pi/agent`, pi's user-scope configuration directory. It holds the settings file, the symlink that gives pi the Claude Code instructions, and the extensions that give it the Claude Code commands and rules. [`docs/agents/pi.md`](../../docs/agents/pi.md) is the overview.

## Contents

- [Directory layout](#directory-layout)
- [Settings](#settings)
- [Footer and context usage](#footer-and-context-usage)
- [Project Claude resources](#project-claude-resources)
- [Skills](#the-skills-array)
- [Settings drift](#settings-drift)
- [File removal](#file-removal)

## Directory layout

| Path                                  | What lives there                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`modify_settings.json`](#settings)   | chezmoi modify script for `~/.pi/agent/settings.json`. Sets the provider and model, theme, the `skills` and `packages` arrays, and the model list. |
| `symlink_AGENTS.md`                   | Holds `../../.claude/CLAUDE.md`, so `~/.pi/agent/AGENTS.md` is the Claude Code instruction file. pi loads it in every project, trusted or not.     |
| [`extensions/`](extensions/README.md) | One directory per extension, each with `index.ts`, a README, and implementation notes.                                                             |

### Instruction symlink

The symlink target is relative to the link, not to the home directory: chezmoi writes the file's content as the target verbatim, so `../../.claude/CLAUDE.md` resolves from `~/.pi/agent/` and a path written from `~` would dangle.

## Settings

| Setting                         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Effect                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `defaultProvider`               | `openai`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Provider for a new session.                                                                         |
| `defaultModel`                  | `gpt-6-sol`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Model for a new session.                                                                            |
| `enabledModels`                 | three OpenRouter models and `openai/gpt-6-sol`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The models offered in the picker. pi writes this key itself, see [Settings drift](#settings-drift). |
| `theme`                         | `light`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                     |
| `hideThinkingBlock`             | `true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Thinking is not rendered in the transcript.                                                         |
| `terminal.showTerminalProgress` | `true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Progress in the terminal title.                                                                     |
| `packages`                      | `pi-web-access`, `pi-footer`, `pi-context-view`, `@juicesharp/rpiv-ask-user-question`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Web tools, the three-line footer, the context viewer, and structured questions.                     |
| `skills`                        | `["~/.claude/skills", "!../../.claude/skills/synced/**"]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | The Claude Code skills, minus the claude.ai cache. See below.                                       |
| `extensions`                    | `["~/.claude/hooks/block-destructive-commands/pi.ts", "~/.claude/hooks/enforce-cli-tools/pi.ts", "~/.claude/hooks/lint-code/pi.ts", "~/.claude/hooks/block-commit-attribution/pi.ts", "~/.claude/hooks/block-secret-commits/pi.ts", "~/.claude/hooks/format-prettier/pi.ts", "~/.claude/hooks/format-org-tables/pi.ts", "~/.claude/hooks/format-terraform/pi.ts", "~/.claude/hooks/lint-prose/pi.ts", "~/.claude/hooks/type-check-tsc/pi.ts", "~/.claude/hooks/type-check-pyrefly/pi.ts", "~/.claude/hooks/track-session-changes/pi.ts"]` | The `pi.ts` of each hook that has moved to TypeScript. Remove a line to turn that hook off in pi.   |

The extensions in `extensions/` need no entry: `~/.pi/agent/extensions/*/index.ts` is a path pi scans on its own. A hook's `pi.ts` needs one, because pi resolves the imports of a linked file from the link's folder, not from the hook folder.

## Footer and context usage

### Footer layout

[`pi-footer`](https://github.com/wobondar/pi-footer) uses [`extensions/pi-footer.json`](extensions/pi-footer.json) for three gray powerline rows: working directory/branch/diff totals, origin remote URL/model, and context bar with used/max tokens and percentage. Home paths use `~`. The built-in widgets do not show the remote as `owner/repo`. Use a Powerline-compatible font for the separators.

### Codex quotas

The local [`codex-usage`](extensions/codex-usage/README.md) extension supplies ChatGPT plan session (5-hour) and weekly quota-used percentages through two `external-status` widgets beside the context bar for `openai` and `openai-codex` models. It uses Pi's companion **OpenAI Codex (legacy)** login for quota reads and verifies the active OpenAI app registration before displaying plan limits; `/codex-usage` refreshes the values. Keep the current OpenAI model and use the same account/workspace for both logins. Other providers hide these widgets.

### Save footer changes

Run `/footer` to edit the live layout. Save a change back to this repository if you want it to survive the next chezmoi apply, which restores the tracked configuration. The settings merge removes the retired `powerline` key and replaces the package list, so the old footer is not loaded.

### Inspect context

[`pi-context-view`](https://github.com/dimk90/pi-context-view) keeps its on-demand visualization. Run `/context` for the estimated context breakdown or `/context injections` to inspect the system prompt, tool definitions, and extension instructions. It adds no instructions to model context. Unscoped Claude rules use native instruction-file records, so each rule appears under Instruction Files. Path-scoped rules remain conditional messages.

## Project Claude resources

### Scope and approval

The global `skills` array loads user skills only. Relative entries in user settings resolve from `~/.pi/agent`, not from the current repository. The `claude-project` coordinator approves local resources.

Each resource extension consumes its approval event:

- `claude-commands` registers commands.
- `claude-rules` loads rules.
- `claude-skills` adds `<cwd>/.claude/skills` through pi's resource hook.

The three resource extensions can be enabled independently. No project `.pi/settings.json` is required. See [project resources](extensions/claude-commands/README.md#project-resources) for trust decisions and name conflicts.

### Reload project resources

Run pi from the repository root, then use `/reload` to pick up new files.

## The `skills` array

### Skill loading and compatibility

pi implements the same Agent Skills standard as Claude Code, so every `SKILL.md` under `~/.claude/skills` registers unchanged as `/skill:<name>`, with `name` and `description` read by pi's own loader. That covers the skills in `dot_claude/skills/` and the ones APM installs next to them. pi delivers the raw skill body: no `` !`cmd` `` span, no `@file` inlining, no `$ARGUMENTS`, no `context: fork`. No skill in this repository uses them.

### Exclude the claude.ai cache

The exclusion covers `~/.claude/skills/synced/`, which Claude Code fills from claude.ai with one bucket per organisation, named `<org id>_<user id>`. Each bucket holds the same set of Anthropic skills, so with two organisations every name appears twice and pi reports `[Skill conflicts]` on `/reload`. Those skills belong to claude.ai (`docs`, `morning`, and `import-memory` do nothing outside it), the directory is not in this repository, and pi already loads the repository's own `meeting-summarizer`, so pi skips the whole directory. A skill that exists only in a bucket can be brought back with a `+` entry naming its path.

### Exclusion path matching

The pattern is written relative to `~/.pi/agent`, not with `~`. pi expands `~` in a plain path entry, but it matches a `!` pattern with minimatch (`matchesAnyPattern` in `dist/core/package-manager.js`) against three strings: the path relative to `~/.pi/agent`, the basename, and the absolute path. None of them contains `~`, so `!~/.claude/skills/synced/**` matches nothing. `!**/synced/**` fails too, because minimatch does not let `**` cross the `.claude` dot segment without `dot: true`. The relative form works on this container and on the macOS host alike; an absolute path would not.

## Settings drift

### Changes made by pi

pi writes to `~/.pi/agent/settings.json` itself: a model change in the TUI updates `defaultModel` and `enabledModels`, and pi adds `deviceId` and `lastChangelogVersion`.

### Merge behavior

`modify_settings.json` is a chezmoi modify script, so `chezmoi apply` does not stop to ask. It merges the repository keys over the current file with `jq`: a repository key wins, and a key the repository leaves out, such as `deviceId`, stays. Objects merge key by key, and a repository array replaces the current one. To keep a model change, add it to `modify_settings.json`; the next apply resets it otherwise.

## File removal

`chezmoi apply` adds and updates but does not remove. A file deleted from this directory, or from `dot_claude/`, stays installed until it is removed from `$HOME` by hand.
