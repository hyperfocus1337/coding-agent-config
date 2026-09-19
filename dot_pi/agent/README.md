# pi agent directory

chezmoi renders this directory to `~/.pi/agent`, pi's user-scope configuration directory. It holds the settings file, the symlink that gives pi the Claude Code instructions, and the extensions that give it the Claude Code commands and rules. [`docs/agents/pi.md`](../../docs/agents/pi.md) is the overview.

| Path                                  | What lives there                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`settings.json`](#settings)          | Provider and model, theme, the `skills` and `packages` arrays, and the model list pi writes itself.                                            |
| `symlink_AGENTS.md`                   | Holds `../../.claude/CLAUDE.md`, so `~/.pi/agent/AGENTS.md` is the Claude Code instruction file. pi loads it in every project, trusted or not. |
| [`extensions/`](extensions/README.md) | One directory per extension, each with `index.ts`, a README, and implementation notes.                                                         |

The symlink target is relative to the link, not to the home directory: chezmoi writes the file's content as the target verbatim, so `../../.claude/CLAUDE.md` resolves from `~/.pi/agent/` and a path written from `~` would dangle.

## Settings

| Setting                         | Value                                                     | Effect                                                                                              |
| ------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `defaultProvider`               | `openrouter`                                              | Provider for a new session.                                                                         |
| `defaultModel`                  | `deepseek/deepseek-v4.1-flash`                            | Model for a new session.                                                                            |
| `enabledModels`                 | three OpenRouter models                                   | The models offered in the picker. pi writes this key itself, see [Settings drift](#settings-drift). |
| `theme`                         | `light`                                                   |                                                                                                     |
| `hideThinkingBlock`             | `true`                                                    | Thinking is not rendered in the transcript.                                                         |
| `terminal.showTerminalProgress` | `true`                                                    | Progress in the terminal title.                                                                     |
| `packages`                      | `["npm:pi-mcp-adapter"]`                                  | MCP support, which pi does not ship. The package also contributes the `mcp-scripting` skill.        |
| `skills`                        | `["~/.claude/skills", "!../../.claude/skills/synced/**"]` | The Claude Code skills, minus the claude.ai cache. See below.                                       |

Extensions need no entry: `~/.pi/agent/extensions/*/index.ts` is a path pi scans on its own.

### The `skills` array

pi implements the same Agent Skills standard as Claude Code, so every `SKILL.md` under `~/.claude/skills` registers unchanged as `/skill:<name>`, with `name` and `description` read by pi's own loader. That covers the skills in `dot_claude/skills/` and the ones APM installs next to them. pi delivers the raw skill body: no `` !`cmd` `` span, no `@file` inlining, no `$ARGUMENTS`, no `context: fork`. No skill in this repository uses them.

The exclusion covers `~/.claude/skills/synced/`, which Claude Code fills from claude.ai with one bucket per organisation, named `<org id>_<user id>`. Each bucket holds the same set of Anthropic skills, so with two organisations every name appears twice and pi reports `[Skill conflicts]` on `/reload`. Those skills belong to claude.ai (`docs`, `morning`, and `import-memory` do nothing outside it), the directory is not in this repository, and pi already loads the repository's own `meeting-summarizer`, so pi skips the whole directory. A skill that exists only in a bucket can be brought back with a `+` entry naming its path.

The pattern is written relative to `~/.pi/agent`, not with `~`. pi expands `~` in a plain path entry, but it matches a `!` pattern with minimatch (`matchesAnyPattern` in `dist/core/package-manager.js`) against three strings: the path relative to `~/.pi/agent`, the basename, and the absolute path. None of them contains `~`, so `!~/.claude/skills/synced/**` matches nothing. `!**/synced/**` fails too, because minimatch does not let `**` cross the `.claude` dot segment without `dot: true`. The relative form works on this container and on the macOS host alike; an absolute path would not.

### Settings drift

pi writes to `~/.pi/agent/settings.json` itself: a model change in the TUI updates `enabledModels` there. `chezmoi apply` then stops to ask whether to overwrite, and fails without a TTY. Fold the change into `settings.json` here, then apply that one file with `chezmoi apply --source <repo> --destination "$HOME" --force ~/.pi/agent/settings.json`, or run `just chezmoi` from a terminal and answer the prompt.

`chezmoi apply` adds and updates but does not remove. A file deleted from this directory, or from `dot_claude/`, stays installed until it is removed from `$HOME` by hand.
