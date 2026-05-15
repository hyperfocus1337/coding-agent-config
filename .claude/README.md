# Portable Claude Code

Portable Claude configuration — commands, skills, and Claude artifacts shareable across Claude Code installations.

Clone this repo and symlink (or copy) the `.claude/` directory into any project to bring your commands, skills, and settings with you.

## CLAUDE.md

`CLAUDE.md` is loaded by Claude Code as system-wide context at the start of every session. Use it to encode standing instructions, conventions, and preferences that should apply across all projects — things like preferred code navigation strategies, coding style rules, or tool usage guidelines. The one in this repo instructs Claude to prefer LSP-based code intelligence (go-to-definition, find-references) over file searches wherever possible.

## Hooks

Hooks are shell commands Claude Code runs on tool lifecycle events (e.g. after every `Write`/`Edit`). Configured in `settings.json` and stored in `hooks/`.

| Hook                                | Trigger                               | Action                                                                                                                                                                                                                                                                                                     |
|-------------------------------------|---------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `hooks/prettify-md-tables/hook.mjs` | `PostToolUse` on Write/Edit/MultiEdit | Aligns markdown table columns in any edited `.md` / `.markdown` file via [`markdown-table-prettify`](https://www.npmjs.com/package/markdown-table-prettify).                                                                                                                                               |
| `hooks/stage-edited-file/hook.sh`   | `PostToolUse` on Write/Edit/MultiEdit | Runs `git add` on the edited file so each Claude write lands pre-staged in `git status`. Skips failed tool calls, secret-shaped filenames (`.env`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`), and paths outside a git repo. Note: re-stages whole file even if you had a partial `git add -p` selection. |

Surgical by design — only table formatting is touched; prose and code blocks pass through unchanged. The prettify hook silently no-ops on non-markdown files, malformed JSON input, or read/write errors, so a formatting hiccup never blocks a Claude tool call. Failures are swallowed; the 10s timeout in `settings.json` caps worst-case runtime. The staging hook follows the same swallow-and-exit-0 contract with a 5s timeout, gates on `tool_response.success`, prefers `$CLAUDE_PROJECT_DIR` for the repo root, and self-disables if `jq` is missing.

Node-based hooks declare their own `package.json` next to `hook.mjs`. The [`scripts/integration/symlink.sh`](../scripts/integration/symlink.sh) setup script runs `npm install` for every `hooks/*/package.json` it finds (skipping directories that already have `node_modules/`), so deps are provisioned automatically on first link and idempotently on subsequent runs.

Shell-based hooks (e.g. `stage-edited-file/hook.sh`) parse the JSON payload with [`jq`](https://jqlang.github.io/jq/), so `jq` must be on `$PATH` (install via `brew install jq` on macOS).

## Status line

The status line is rendered by [ccstatusline](https://github.com/sirmalloc/ccstatusline), invoked from the `statusLine` block in `settings.json` as `npx -y ccstatusline@latest`. Claude Code pipes session context (cwd, model, git, etc.) to it on stdin and the rendered line is shown at the bottom of the TUI.

Run `npx ccstatusline@latest` (no flags) for the interactive TUI to pick widgets, colours, and ordering — choices are persisted to `~/.claude/ccstatusline.json` and picked up on the next refresh.

The setup flow also installs [Powerline fonts](https://github.com/powerline/fonts), needed so the separator glyphs (e.g. ``) render correctly. Set your terminal to a Powerline-patched font (e.g. `Meslo LG M for Powerline`) after install.

Requires `npx` (Node) on `$PATH`.

## Skills

Skills are on-demand reference documents that Claude reads when a task calls for specialised knowledge. They live in `skills/<name>/SKILL.md` and are loaded explicitly rather than injected into every prompt, keeping context lean.

| Skill    | Description                                                                           |
|----------|---------------------------------------------------------------------------------------|
| `gh-cli` | Comprehensive GitHub CLI reference — repos, issues, PRs, Actions, releases, and more. |

## Commands

### `git/` — Version control helpers

#### /git:changelog

Generate a structured changelog from git history, organised by commit type (feat, fix, refactor, etc.) and saved as a dated markdown file.

### `issues/` — GitHub issue workflow

#### /issues:improve-issue

Rewrite a GitHub issue to be clearer and more actionable (outputs text ready to paste).

#### /issues:improve-issue-in-place

Same as above, but edits the issue directly via `gh`.

#### /issues:github-coding-process

Full plan → branch → implement → test → PR workflow driven by a GitHub issue number.

### `simple/` — Everyday utilities

#### /simple:explain

Step-by-step breakdown of a selected code snippet.

#### /simple:proofread

Spelling, grammar, and readability pass on selected text.
