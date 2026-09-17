---
disable-model-invocation: true
---

# slash commands

Slash commands are prompt templates Claude Code runs when you type `/<namespace>:<name>` (e.g. `/git:changelog`, or `/git:pr:create` for a nested group). Each lives as its own file at `commands/<namespace>/<name>.md`, and the file's frontmatter `description` is what shows in the command picker. They deploy via chezmoi to `~/.claude/commands/`.

## where `$ARGUMENTS` goes

Position the placeholder by what the argument holds, not by a fixed line number.

- A **parameter** is a short value the command consumes: a file path, a commit ref, an issue number, a period keyword, an author string. Put it inline at the point of use, near the top, because the instructions after it refer to it. Some parameters can only sit inline: `chezmoi:diff` substitutes it into a `!` bash block, `issues:improve-issue` into a `gh issue view` call, and `git:changelog` tests its value in four conditionals.
- **Content** is a blob the command transforms: prose, code, a transcript. Put it on the last line, alone, after every instruction. A blob has no length limit and can contain text that reads like an instruction, so nothing must follow it. This also keeps the phrase "the prose below" true.

## style/ — response style

| Command          | Description                                                                      |
| ---------------- | -------------------------------------------------------------------------------- |
| `/style:concise` | Report back extremely concisely, sacrificing grammar for the sake of concision.  |
| `/style:caveman` | Compressed prose: drop articles, filler, and hedging, keep every technical fact. |

Source: [Claude Code tip (YouTube Shorts)](https://youtube.com/shorts/I12Mf8KBT1I).

`/style:caveman` condenses the [caveman plugin](https://github.com/JuliusBrussee/caveman)'s `SessionStart` instructions into 9 directives, from about 22 across 4,180 characters. The plugin is not installed, so the mode is opt-in: the command carries `disable-model-invocation: true` and costs nothing until it is invoked, and it names the `rules/writing.md` rules it overrides while active. See `docs/research/instruction-load.md`.

## ask/ — ask before acting

Two one-shot commands that ask what is unclear before the work starts. Each takes the task as its argument, and falls back to my last request when called with no argument.

| Command        | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `/ask:clarify` | Ask every question whose answer changes the work, then do the task.         |
| `/ask:options` | Turn every open decision into a multiple-choice question, then do the task. |

`clarify` delivers a question through the `AskUserQuestion` tool when the answer is a pick from a small set, and as a numbered list when it is open. `options` always uses the tool, which takes four questions per call, so it asks in batches. Both leave out what they can answer from the code, the repository, or the conversation.

## docs/ — documentation style

Two mode switches that stay on for the session, and five one-shot edits that act on the text pasted after the command.

| Command               | Description                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/docs:current-state` | Write docs describing only the current state, with no change-history framing.                               |
| `/docs:user-friendly` | Write docs from the reader's point of view, not the implementer's.                                          |
| `/docs:delegate`      | Keep the reader side beside the code, move the mechanism and reasoning to `<notes-file>`, and link the two. |
| `/docs:condense`      | Shorten prose to the fewest sentences that keep every fact a reader acts on.                                |
| `/docs:keybindings`   | Document commands and keybindings as rows in the keybindings table of their section.                        |
| `/docs:annotate`      | Add one or two sentences above a code block or setting that say what it does and why.                       |
| `/docs:paragraphs`    | Split a wall of text into short paragraphs, one idea each, without changing the words.                      |

`delegate`, `condense`, `keybindings`, and `annotate` come from one day of prompts against a literate Doom Emacs config: `delegate` and `condense` were asked together every time, `keybindings` covered six requests to add or reshape cheatsheet rows, and `annotate` three requests for a note above a block. `delegate` takes the notes file as its first argument, so the command carries no repo path.

## git/ — version control helpers

Sixteen commands covering the everyday flow, branch hygiene, and history rewriting.

| Command                    | Description                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/git:commit:any`          | Route to the commit command that fits the changes.                                                                |
| `/git:commit:single`       | Create a single git commit (stage all, one commit).                                                               |
| `/git:commit:task`         | Commit one task's changes from the current conversation.                                                          |
| `/git:commit:conversation` | Commit this conversation's changes as scoped commits.                                                             |
| `/git:commit:multiple`     | Split changes into several commits.                                                                               |
| `/git:commit:extend`       | Fold changes into an existing commit.                                                                             |
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

`commit:any` makes the choice between the five commit commands for you, on two axes: which changes to take, and how many commits to make. It routes, then the command it picked runs its own process. See [git/README.md](git/README.md) for the axes and the two extra checks it adds.

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

## chezmoi/ — dotfile sync

| Command          | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `/chezmoi:diff`  | Show the diff between the source state and the home directory.       |
| `/chezmoi:add`   | Add a file to the source state.                                      |
| `/chezmoi:apply` | Apply the source state to the home directory after showing the diff. |

`diff` and `add` carry `disable-model-invocation: true`: they run only when typed. `apply` does not, so the [`rules/apply.md`](../rules/apply.md) rule can run it after an edit to a chezmoi source directory succeeds.

## doom/ — Doom Emacs maintenance

| Command         | Description                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/doom:sync`    | Update `~/.emacs.d` to the latest master, then run `doom sync`.                                                                             |
| `/doom:restart` | Tangle `config.org` in the `doom` daemon, run the `/doom:sync` steps, then restart the daemon with `emacsclient` and `emacs --daemon=doom`. |

`restart` carries `disable-model-invocation: true`: it closes every attached frame, so it runs only when typed. `sync` does not, so the [`rules/apply.md`](../rules/apply.md) rule can run it after an edit under `dot_doom.d/`. The commands run at expansion time through `!` blocks, so `/doom:restart` repeats the sync sequence instead of invoking `/doom:sync`.

## simple/ — everyday utilities

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `/simple:explain`   | Explain a code snippet step-by-step.             |
| `/simple:proofread` | Proofread text (spelling, grammar, readability). |

File conversion moved out of this namespace: it is the [`markitdown`](../skills/markitdown/) skill now, which the `rules/tools.md` rule reaches for on its own before reading a binary document.
