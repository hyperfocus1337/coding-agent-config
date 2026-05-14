# Portable Claude Code

Portable Claude configuration — commands, skills, and Claude artifacts shareable
across Claude Code installations.

Clone this repo and symlink (or copy) the `.claude/` directory into any project
to bring your commands, skills, and settings with you.

## CLAUDE.md

`CLAUDE.md` is loaded by Claude Code as system-wide context at the start of
every session. Use it to encode standing instructions, conventions, and
preferences that should apply across all projects — things like preferred code
navigation strategies, coding style rules, or tool usage guidelines. The one in
this repo instructs Claude to prefer LSP-based code intelligence
(go-to-definition, find-references) over file searches wherever possible.

## Hooks

Hooks are shell commands Claude Code runs on tool lifecycle events (e.g. after
every `Write`/`Edit`). Configured in `settings.json` and stored in `hooks/`.

| Hook                       | Trigger                               | Action                                                          |
| -------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `hooks/format-markdown.sh` | `PostToolUse` on Write/Edit/MultiEdit | Runs `markdownlint-cli2 --fix` on any `.md` / `.markdown` file. |

## Status line

The status line is rendered by [ccstatusline](https://github.com/sirmalloc/ccstatusline),
invoked from the `statusLine` block in `settings.json` as
`npx -y ccstatusline@latest`. Claude Code pipes session context (cwd, model,
git, etc.) to it on stdin and the rendered line is shown at the bottom of the
TUI.

Run `npx ccstatusline@latest` (no flags) for the interactive TUI to pick
widgets, colours, and ordering — choices are persisted to
`~/.claude/ccstatusline.json` and picked up on the next refresh.

The setup flow also installs [Powerline fonts](https://github.com/powerline/fonts),
needed so the separator glyphs (e.g. ``) render correctly. Set your
terminal to a Powerline-patched font (e.g. `Meslo LG M for Powerline`) after
install.

Requires `npx` (Node) on `$PATH`.

## Skills

Skills are on-demand reference documents that Claude reads when a task calls for
specialised knowledge. They live in `skills/<name>/SKILL.md` and are loaded
explicitly rather than injected into every prompt, keeping context lean.

| Skill    | Description                                                                           |
| -------- | ------------------------------------------------------------------------------------- |
| `gh-cli` | Comprehensive GitHub CLI reference — repos, issues, PRs, Actions, releases, and more. |

## Commands

### `git/` — Version control helpers

#### /git:changelog

Generate a structured changelog from git history, organised by commit type
(feat, fix, refactor, etc.) and saved as a dated markdown file.

### `issues/` — GitHub issue workflow

#### /issues:improve-issue

Rewrite a GitHub issue to be clearer and more actionable (outputs text ready to
paste).

#### /issues:improve-issue-in-place

Same as above, but edits the issue directly via `gh`.

#### /issues:github-coding-process

Full plan → branch → implement → test → PR workflow driven by a GitHub issue
number.

### `simple/` — Everyday utilities

#### /simple:explain

Step-by-step breakdown of a selected code snippet.

#### /simple:proofread

Spelling, grammar, and readability pass on selected text.
