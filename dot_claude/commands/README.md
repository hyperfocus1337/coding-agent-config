---
disable-model-invocation: true
---

# slash commands

Slash commands are prompt templates Claude Code runs when you type `/<namespace>:<name>` (e.g. `/git:changelog`, or `/git:pr:create` for a nested group). Each lives as its own file at `commands/<namespace>/<name>.md`, and the file's frontmatter `description` is what shows in the command picker. They deploy via chezmoi to `~/.claude/commands/`.

## style/ — response style

| Command          | Description                                                                      |
| ---------------- | -------------------------------------------------------------------------------- |
| `/style:concise` | Report back extremely concisely, sacrificing grammar for the sake of concision.  |
| `/style:caveman` | Compressed prose: drop articles, filler, and hedging, keep every technical fact. |

Source: [Claude Code tip (YouTube Shorts)](https://youtube.com/shorts/I12Mf8KBT1I).

`/style:caveman` condenses the [caveman plugin](https://github.com/JuliusBrussee/caveman)'s `SessionStart` instructions into 9 directives, from about 22 across 4,180 characters. The plugin is not installed, so the mode is opt-in: the command carries `disable-model-invocation: true` and costs nothing until it is invoked, and it names the `rules/writing.md` rules it overrides while active. See `docs/research/instruction-load.md`.

## docs/ — documentation style

| Command               | Description                                                                   |
| --------------------- | ----------------------------------------------------------------------------- |
| `/docs:current-state` | Write docs describing only the current state, with no change-history framing. |

## git/ — version control helpers

Fourteen commands covering the everyday flow, branch hygiene, and history rewriting.

| Command                    | Description                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/git:commit:single`       | Create a git commit (stage all, single commit).                                                                   |
| `/git:commit:session`      | Commit one task's changes from the current conversation.                                                          |
| `/git:commit:multiple`     | Split changes into a logical sequence of commits.                                                                 |
| `/git:commit:extend`       | Fold working directory changes into an existing commit.                                                           |
| `/git:commit:push`         | Commit and push.                                                                                                  |
| `/git:push`                | Push the current branch to origin, then ask before pushing to any other remote.                                   |
| `/git:pr:create`           | Commit, push, and open a PR.                                                                                      |
| `/git:changelog`           | Generate a changelog file for a time period (day, week, month, year, or N days).                                  |
| `/git:branches:cleanup`    | Delete local branches whose remote is gone, or that are merged into main or master, after confirming an overview. |
| `/git:worktrees:cleanup`   | Remove worktrees whose branch is `[gone]` on the remote, then delete them.                                        |
| `/git:worktrees:configure` | Set `worktree.useRelativePaths` so worktrees work from a container and the host.                                  |
| `/git:rewrite:author`      | Rewrite the author of the whole branch or the last N commits.                                                     |
| `/git:rewrite:date`        | Set an absolute commit and author date on the most recent commit.                                                 |
| `/git:rewrite:shift-dates` | Shift the last N commit dates by a number of hours (GNU and BSD `date`).                                          |

The three history-rewriting commands (`rewrite:author`, `rewrite:date`, `rewrite:shift-dates`) show current commits and confirm before running. See [git/README.md](git/README.md) for their argument slots and the three ways to call them safely.

## organize/ — section a config or code file

Eight variants of the same operation: reorganize a file into comment-delimited sections, differing only in header style.

| Command                            | Header style                                         |
| ---------------------------------- | ---------------------------------------------------- |
| `/organize:banner-comments`        | Three-line banner headers.                           |
| `/organize:rule-banner-comments`   | Three-line banner headers with box-drawing rules.    |
| `/organize:boxed-comments`         | Full-box headers.                                    |
| `/organize:numbered-comments`      | Numbered sections with a matching table of contents. |
| `/organize:underlined-comments`    | Name with a rule beneath it.                         |
| `/organize:plain-comments`         | Just the comment character and the name.             |
| `/organize:minimal-comments`       | Single-line divider headers.                         |
| `/organize:trailing-rule-comments` | Name flush-left with a rule trailing to width.       |

## issues/ — GitHub issue workflow

| Command                          | Description                                                              |
| -------------------------------- | ------------------------------------------------------------------------ |
| `/issues:improve-issue`          | Rewrite a GitHub issue to be clearer and more actionable (outputs text). |
| `/issues:improve-issue-in-place` | Same, but updates the issue directly via `gh`.                           |
| `/issues:github-coding-process`  | Plan, implement, test, and ship a GitHub issue end-to-end using `gh`.    |

## summarize/ — transcript summaries

| Command                   | Description                                                                   |
| ------------------------- | ----------------------------------------------------------------------------- |
| `/summarize:transscripts` | Summarize a meeting or transcript into structured sections with action items. |

## simple/ — everyday utilities

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `/simple:explain`   | Explain a code snippet step-by-step.             |
| `/simple:proofread` | Proofread text (spelling, grammar, readability). |

File conversion moved out of this namespace: it is the [`markitdown`](../skills/markitdown/) skill now, which the `rules/tools.md` rule reaches for on its own before reading a binary document.
