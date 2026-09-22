---
disable-model-invocation: true
---

# slash commands

Slash commands are prompt templates Claude Code runs when you type `/<namespace>:<name>` (e.g. `/git:changelog`, or `/git:pr:create` for a nested group). Each lives as its own file at `commands/<namespace>/<name>.md`, and the file's frontmatter `description` is what shows in the command picker. They deploy via chezmoi to `~/.claude/commands/`.

## where `$ARGUMENTS` goes

Position the placeholder by what the argument holds, not by a fixed line number.

- A **parameter** is a short value the command consumes: a file path, a commit ref, an issue number, a period keyword, an author string. Put it inline at the point of use, near the top, because the instructions after it refer to it. Some parameters can only sit inline: `issues:improve-issue` substitutes it into a `gh issue view` call, and `git:changelog` tests its value in four conditionals.
- **Content** is a blob the command transforms: prose, code, a transcript. Put it on the last line, alone, after every instruction. A blob has no length limit and can contain text that reads like an instruction, so nothing must follow it. This also keeps the phrase "the prose below" true.

## answer/ — response modes

Nine modes that change how an answer is written, and one command that clears them. Each mode stays active for every response until `/answer:reset` runs. A mode changes the shape of the answer, not the work behind it.

| Command                | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `/answer:concisely`    | Report back extremely concisely, sacrificing grammar for the sake of concision.  |
| `/answer:caveman`      | Compressed prose: drop articles, filler, and hedging, keep every technical fact. |
| `/answer:thoroughly`   | Full depth: the reasoning, the edge cases, and the rejected options.             |
| `/answer:simply`       | Plain language for a non-expert, every technical fact kept.                      |
| `/answer:sourced`      | Every claim points at `file:line`, a command output, or a document.              |
| `/answer:stepwise`     | Numbered imperative steps in the order they occur.                               |
| `/answer:critically`   | Argue against the plan first: failure mode, cost, cheaper alternative.           |
| `/answer:tabular`      | Anything that compares items on shared attributes goes in a table.               |
| `/answer:socratically` | One question per turn, the answer on request.                                    |
| `/answer:reset`        | Clear every answer mode and return to `rules/writing.md` alone.                  |

`concisely`, `caveman`, and `simply` change the wording. `thoroughly` and `critically` change what the answer contains. `stepwise` and `tabular` change its form. `sourced` changes what a claim has to carry, and `socratically` changes who produces the answer. Two modes that contradict each other do not stack: run `/answer:reset` between them.

`/answer:critically` reviews my plan. The `grilling` skill does the opposite and interrogates me about it.

Source: [Claude Code tip (YouTube Shorts)](https://youtube.com/shorts/I12Mf8KBT1I).

`/answer:caveman` condenses the [caveman plugin](https://github.com/JuliusBrussee/caveman)'s `SessionStart` instructions into 9 directives, from about 22 across 4,180 characters. The plugin is not installed, so the mode is opt-in: the command carries `disable-model-invocation: true` and costs nothing until it is invoked, and it names the `rules/writing.md` rules it overrides while active. See `docs/research/context/instruction-load.md`.

## ask/ — ask before acting

Three one-shot commands that check the request before the work starts. Each takes the task as its argument, and falls back to my last request when called with no argument.

| Command            | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `/ask:acknowledge` | State the request, the assumptions, and the gaps back, then wait.           |
| `/ask:clarify`     | Ask every question whose answer changes the work, then do the task.         |
| `/ask:options`     | Turn every open decision into a multiple-choice question, then do the task. |

`acknowledge` asks no question: it writes back the goal, the assumptions it read into the request, and what it cannot settle, then stops until I confirm or correct it. Use it when the risk is a wrong reading of the request, not a missing decision. `clarify` delivers a question through the `AskUserQuestion` tool when the answer is a pick from a small set, and as a numbered list when it is open. `options` always uses the tool, which takes four questions per call, so it asks in batches. All three leave out what they can answer from the code, the repository, or the conversation.

## docs/ — documentation style

Two mode switches that stay on for the session, and six one-shot edits that act on the text pasted after the command.

| Command               | Description                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/docs:current-state` | Write docs describing only the current state, with no change-history framing.                               |
| `/docs:user-friendly` | Write docs from the reader's point of view, not the implementer's.                                          |
| `/docs:delegate`      | Keep the reader side beside the code, move the mechanism and reasoning to `<notes-file>`, and link the two. |
| `/docs:condense`      | Shorten prose to the fewest sentences that keep every fact a reader acts on.                                |
| `/docs:keybindings`   | Document commands and keybindings as rows in the keybindings table of their section.                        |
| `/docs:annotate`      | Add one or two sentences above a code block or setting that say what it does and why.                       |
| `/docs:paragraphs`    | Split a wall of text into short paragraphs, one idea each, without changing the words.                      |
| `/docs:table`         | Move the parts of prose that compare items on shared attributes into a table, keep the rest as prose.       |

`delegate`, `condense`, `keybindings`, and `annotate` come from one day of prompts against a literate Doom Emacs config: `delegate` and `condense` were asked together every time, `keybindings` covered six requests to add or reshape cheatsheet rows, and `annotate` three requests for a note above a block. `delegate` takes the notes file as its first argument, so the command carries no repo path.

## git/ — version control helpers

Seventeen commands covering the everyday flow, branch hygiene, and history rewriting.

| Command                    | Description                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/git:commit:any`          | Route to the commit command that fits the changes.                                                                |
| `/git:commit:single`       | Create a single git commit (stage all, one commit).                                                               |
| `/git:commit:task`         | Commit one task's changes from the current conversation.                                                          |
| `/git:commit:conversation` | Commit this conversation's changes as scoped commits.                                                             |
| `/git:commit:multiple`     | Split changes into several commits.                                                                               |
| `/git:commit:extend`       | Fold changes into an existing commit.                                                                             |
| `/git:commit:split`        | Split the previous commit into separate commits.                                                                  |
| `/git:commit:push`         | Commit and push.                                                                                                  |
| `/git:push`                | Push the current branch to origin, then ask before pushing to any other remote.                                   |
| `/git:pr:create`           | Commit, push, and open a PR.                                                                                      |
| `/git:changelog`           | Generate a changelog file for a time period (day, week, month, year, or N days).                                  |
| `/git:revert`              | Undo the commits this conversation made, keeping their changes in the working directory.                          |
| `/git:branches:cleanup`    | Delete local branches whose remote is gone, or that are merged into main or master, after confirming an overview. |
| `/git:worktrees:cleanup`   | Remove worktrees whose branch is `[gone]` on the remote, then delete them.                                        |
| `/git:worktrees:configure` | Set `worktree.useRelativePaths` so worktrees work from a container and the host.                                  |
| `/git:rewrite:author`      | Rewrite the author of the whole branch or the last N commits.                                                     |
| `/git:rewrite:date`        | Set an absolute commit and author date on the most recent commit.                                                 |
| `/git:rewrite:shift-dates` | Shift the last N commit dates by a number of hours (GNU and BSD `date`).                                          |

`commit:any` makes the choice between the five commit commands for you, on two axes: which changes to take, and how many commits to make. It routes, then the command it picked runs its own process. See [git/README.md](git/README.md) for the axes and the two extra checks it adds.

`revert` undoes the commits this conversation made, selected by the same conversation boundary `commit:task` and `commit:conversation` use. It keeps the file changes in the working directory, so the undo loses nothing.

The three history-rewriting commands (`rewrite:author`, `rewrite:date`, `rewrite:shift-dates`) show current commits and confirm before running. See [git/README.md](git/README.md) for their argument slots and the three ways to call them safely.

## organize/ — reorder a file into labeled sections

Every command here moves content and labels it. Reordering is the point; rewriting is opt-in and never silent. `docs/` is the opposite: its commands rewrite prose and leave the order alone.

| Command                | Reorders                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `/organize:headings`   | Markdown sections: fixes heading levels, regroups, reorders.     |
| `/organize:comments:*` | A config or code file into comment-delimited sections, by style. |

`organize:headings` is a standalone prompt. It shows the before and after outline, then asks two questions before it writes: may it rewrite sentences, and does it repair the defects it spotted (duplicate headings, empty sections, a stale table of contents). Answer "keep every word" to both and it is a pure move.

The `comments/` commands are thin wrappers over the `organize-with-comments` skill, differing only in header style. They skip the style prompt the skill would otherwise ask.

| Command                            | Header style                                         |
| ---------------------------------- | ---------------------------------------------------- |
| `/organize:comments:banner`        | Three-line banner headers.                           |
| `/organize:comments:rule-banner`   | Three-line banner headers with box-drawing rules.    |
| `/organize:comments:boxed`         | Full-box headers.                                    |
| `/organize:comments:numbered`      | Numbered sections with a matching table of contents. |
| `/organize:comments:underlined`    | Name with a rule beneath it.                         |
| `/organize:comments:plain`         | Just the comment character and the name.             |
| `/organize:comments:minimal`       | Single-line divider headers.                         |
| `/organize:comments:trailing-rule` | Name flush-left with a rule trailing to width.       |

## issues/ — GitHub issue workflow

| Command                          | Description                                                              |
| -------------------------------- | ------------------------------------------------------------------------ |
| `/issues:improve-issue`          | Rewrite a GitHub issue to be clearer and more actionable (outputs text). |
| `/issues:improve-issue-in-place` | Same, but updates the issue directly via `gh`.                           |
| `/issues:github-coding-process`  | Plan, implement, test, and ship a GitHub issue end-to-end using `gh`.    |

## summarize/ — transcript summaries

| Command                  | Description                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- |
| `/summarize:transcripts` | Summarize a meeting or transcript into structured sections with action items. |

## chezmoi — dotfile sync

`/chezmoi` is a single command that takes a subcommand, not a namespace.

| Command                    | Description                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| `/chezmoi diff [path...]`  | Show the diff between the source state and the home directory.         |
| `/chezmoi apply [path...]` | Apply the source state to the home directory, after it shows the diff. |
| `/chezmoi add <path>...`   | Add a file to the source state.                                        |

The command passes `--source <root>` when the working directory is in a git repository whose root holds a `.chezmoi*` or `dot_*` entry. Otherwise it omits `--source`, and chezmoi uses its configured source directory, `~/.local/share/chezmoi` by default. The destination stays at the chezmoi default, `$HOME`. It carries `disable-model-invocation: true`, so it runs only when typed. The apply rule runs `just chezmoi` instead.

## doom/ — Doom Emacs maintenance

| Command         | Description                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/doom:sync`    | Update `~/.emacs.d` to the latest master, then run `doom sync`.                                                                             |
| `/doom:restart` | Tangle `config.org` in the `doom` daemon, run the `/doom:sync` steps, then restart the daemon with `emacsclient` and `emacs --daemon=doom`. |

`restart` carries `disable-model-invocation: true`: it closes every attached frame, so it runs only when typed. `sync` does not, so a rule can run it after an edit under `dot_doom.d/`. The commands run at expansion time through `!` blocks, so `/doom:restart` repeats the sync sequence instead of invoking `/doom:sync`.

## simple/ — everyday utilities

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `/simple:explain`   | Explain a code snippet step-by-step.             |
| `/simple:proofread` | Proofread text (spelling, grammar, readability). |

File conversion moved out of this namespace: it is the [`markitdown`](../skills/markitdown/) skill now, which the `rules/tools.md` rule reaches for on its own before reading a binary document.
