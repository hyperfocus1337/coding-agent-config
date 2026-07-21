# Portable Claude Code

Portable Claude configuration — commands, skills, and Claude artifacts shareable across Claude Code installations.

Clone this repo and run `chezmoi apply` (or `just chezmoi` from the repo root) to render the `dot_claude/` source into `~/.claude`, bringing your commands, skills, and settings with you.

## CLAUDE.md

`CLAUDE.md` is loaded by Claude Code as system-wide context at the start of every session. Use it to encode standing instructions, conventions, and preferences that should apply across all projects — things like preferred code navigation strategies, coding style rules, or tool usage guidelines.

The file itself is kept minimal — just `@rules/<name>.md` imports. Each rule lives as its own file under `rules/`, making it easy to add, remove, or share individual rules without touching the others.

### `rules/` — Composable standing instructions

| Rule                         | What it governs                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `rules/general.md`           | Output style (no wrapped sentences, no em dashes, sentence-case headings) and always-on context7 use. |
| `rules/code-intelligence.md` | Prefer LSP (go-to-definition, find-references) over file searches; run diagnostics after every edit.  |
| `rules/cli-tools.md`         | Prefer the preinstalled fast CLI tools (rg, fd, bat, jq/yq, httpie, etc.) over slower equivalents.    |
| `rules/ast-grep.md`          | Use ast-grep for structural pattern search when LSP doesn't apply.                                    |

## Commands

Slash commands are prompt templates invoked as `/<namespace>:<name>`, stored one file per command under `commands/`. The full catalog with per-command descriptions is in [`commands/README.md`](commands/README.md).

- `git/` — commit, push, PR, changelog, branch and worktree cleanup, and history rewriting (amend author, amend date, shift dates).
- `organize/` — six variants that section a file into comment-delimited blocks, differing only in header style.
- `issues/` — improve a GitHub issue (in place or as pasteable text), or run the full issue-to-PR coding process.
- `summarize/` — turn a meeting or transcript into structured notes with an action-items table.
- `simple/` — explain a code snippet, proofread text, or convert files to Markdown.

## Hooks

Hooks are shell commands Claude Code runs on tool lifecycle events (e.g. after every `Write`/`Edit`, or before a `Bash` call). They are configured in `settings.json` and stored one directory per hook under `hooks/`, each with its own README covering behavior, dependencies, and install steps.

| Hook                                                                   | Event                            | Summary                                                                                                                 |
| ---------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`format-all-languages`](hooks/format-all-languages/README.md)         | `PostToolUse` (Write/Edit, Bash) | Formats edited files with Prettier by extension; on Bash, re-aligns markdown tables in changed files. Needs `prettier`. |
| [`stage-edited-file`](hooks/stage-edited-file/README.md)               | `PostToolUse` (Write/Edit)       | Runs `git add` on each edited file so writes land pre-staged. Skips secret-shaped names.                                |
| [`lint-all-languages`](hooks/lint-all-languages/README.md)             | `PostToolUse` (Write/Edit)       | Lints the edited file by extension (ruff, eslint, shellcheck, yamllint).                                                |
| [`type-check-all-languages`](hooks/type-check-all-languages/README.md) | `PostToolUse` (Write/Edit)       | Type-checks the whole project by extension (pyrefly, tsc).                                                              |
| [`block-secret-commits`](hooks/block-secret-commits/README.md)         | `PreToolUse` (Bash)              | Blocks `git add`/`git commit` that would touch non-gitignored secret files (`.env`, keys, creds).                       |

Every hook caps its runtime with a timeout in `settings.json` and self-disables cleanly when its tools are missing. The advisory hooks (formatting, staging) swallow failures and exit 0, so a hiccup never blocks a tool call; the lint, type-check, and secret-commit hooks exit 2 to surface errors or a block back to Claude. Shell hooks parse the payload with [`jq`](https://jqlang.github.io/jq/), so `jq` must be on `$PATH` (`brew install jq` on macOS); the formatter needs `prettier` on `$PATH`. See each hook's README for its specific dependencies and install commands.

## Skills

Skills are on-demand reference documents that Claude reads when a task calls for specialised knowledge. They live in `skills/<name>/SKILL.md` and are loaded explicitly rather than injected into every prompt, keeping context lean.

| Skill                | Description                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `gh-cli`             | Comprehensive GitHub CLI reference: repos, issues, PRs, Actions, releases, and more.              |
| `meeting-summarizer` | Turn a meeting/call transcript into a structured English summary with decisions and action items. |
| `organize`           | Reorganize a config or code file into labeled, comment-delimited sections (prompts for a style).  |

## Status line

The status line is rendered by [ccstatusline](https://github.com/sirmalloc/ccstatusline), invoked from the `statusLine` block in `settings.json` as `npx -y ccstatusline@latest`. Claude Code pipes session context (cwd, model, git, etc.) to it on stdin and the rendered line is shown at the bottom of the TUI.

Run `npx ccstatusline@latest` (no flags) for the interactive TUI to pick widgets, colours, and ordering — choices are persisted to `~/.claude/ccstatusline.json` and picked up on the next refresh.

The setup flow also installs [Powerline fonts](https://github.com/powerline/fonts), needed so the separator glyphs (e.g. ``) render correctly. Set your terminal to a Powerline-patched font (e.g. `Meslo LG M for Powerline`) after install.

Requires `npx` (Node) on `$PATH`.
