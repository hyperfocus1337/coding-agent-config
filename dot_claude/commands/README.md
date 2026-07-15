# slash commands

Slash commands are prompt templates Claude Code runs when you type `/<namespace>:<name>` (e.g. `/git:commit`). Each lives as its own file at `commands/<namespace>/<name>.md`, and the file's frontmatter `description` is what shows in the command picker. They deploy via chezmoi to `~/.claude/commands/`.

## git/ — version control helpers

Ten commands covering the everyday flow, branch hygiene, and history rewriting.

| Command             | Description                                                                      |
|---------------------|----------------------------------------------------------------------------------|
| `/git:commit`       | Create a git commit (stage all, single commit).                                  |
| `/git:multiple`     | Split changes into a logical sequence of commits.                                |
| `/git:push`         | Commit and push.                                                                 |
| `/git:pr`           | Commit, push, and open a PR.                                                     |
| `/git:changelog`    | Generate a changelog file for a time period (day, week, month, year, or N days). |
| `/git:branches`     | Delete stale local branches whose remote tracking branch is gone.                |
| `/git:worktrees`    | Remove worktrees whose branch is `[gone]` on the remote, then delete them.       |
| `/git:amend-author` | Rewrite the author of the whole branch or the last N commits.                    |
| `/git:amend-date`   | Set an absolute commit and author date on the most recent commit.                |
| `/git:shift-dates`  | Shift the last N commit dates by a number of hours (GNU and BSD `date`).         |

The three history-rewriting commands (`amend-author`, `amend-date`, `shift-dates`) show current commits and confirm before running. See [git/README.md](git/README.md) for their argument slots and the three ways to call them safely.

## organize/ — section a config or code file

Six variants of the same operation: reorganize a file into comment-delimited sections, differing only in header style.

| Command                         | Header style                                         |
|---------------------------------|------------------------------------------------------|
| `/organize:banner-comments`     | Three-line banner headers.                           |
| `/organize:boxed-comments`      | Full-box headers.                                    |
| `/organize:numbered-comments`   | Numbered sections with a matching table of contents. |
| `/organize:underlined-comments` | Name with a rule beneath it.                         |
| `/organize:plain-comments`      | Just the comment character and the name.             |
| `/organize:minimal-comments`    | Single-line divider headers.                         |

## issues/ — GitHub issue workflow

| Command                          | Description                                                              |
|----------------------------------|--------------------------------------------------------------------------|
| `/issues:improve-issue`          | Rewrite a GitHub issue to be clearer and more actionable (outputs text). |
| `/issues:improve-issue-in-place` | Same, but updates the issue directly via `gh`.                           |
| `/issues:github-coding-process`  | Plan, implement, test, and ship a GitHub issue end-to-end using `gh`.    |

## summarize/ — transcript summaries

| Command                   | Description                                                                   |
|---------------------------|-------------------------------------------------------------------------------|
| `/summarize:transscripts` | Summarize a meeting or transcript into structured sections with action items. |

## simple/ — everyday utilities

| Command              | Description                                                                         |
|----------------------|-------------------------------------------------------------------------------------|
| `/simple:explain`    | Explain a code snippet step-by-step.                                                |
| `/simple:proofread`  | Proofread text (spelling, grammar, readability).                                    |
| `/simple:markitdown` | Convert files (PDF, Office, images, audio, HTML, etc.) to Markdown with markitdown. |
