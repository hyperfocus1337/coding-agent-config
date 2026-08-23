---
disable-model-invocation: true
---

# git slash commands

Shorthand command names and what they map to.

| Command               | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `commit:single`       | Create a git commit                                         |
| `commit:session`      | Commit one task's changes from the current conversation     |
| `commit:multiple`     | Split changes into a logical sequence of commits            |
| `commit:extend`       | Fold working directory changes into an existing commit      |
| `commit:push`         | Commit and push                                             |
| `pr:create`           | Commit, push, and open a PR                                 |
| `branches:cleanup`    | Delete gone or merged branches, after confirmation          |
| `worktrees:cleanup`   | Remove worktrees + delete their `[gone]` branches           |
| `worktrees:configure` | Set `worktree.useRelativePaths` for container + host access |
| `changelog`           | Generate a changelog for a time period                      |
| `rewrite:author`      | Rewrite author of the whole branch or last N commits        |
| `rewrite:date`        | Set an absolute date on the most recent commit              |
| `rewrite:shift-dates` | Shift dates of the last N commits by hours                  |

## Branch cleanup

`branches:cleanup` deletes two classes of local branch and keeps everything else, after you confirm an overview of the candidates. See [`branches/README.md`](branches/README.md) for the full include and exclude list, how the default branch is resolved, and why squash merges are not detected.

## Calling the history-rewriting commands

`rewrite:author`, `rewrite:date`, and `rewrite:shift-dates` rewrite git history, so they all show current commits, warn about force-pushing, and confirm before running. There is no named-argument (`--flag`) syntax in slash commands, only positional slots and free text, so each command is written to be called three ways:

- Bare, then interviewed: run the command with no arguments and answer the questions it asks. You never need to remember argument order, and you see the affected commits before anything changes. This is the safest default.
- Natural language: describe the values after the command, e.g. `/git:rewrite:author "Jane Doe <jane@x.com>" last 5 commits`. The intent is parsed, so order does not have to be exact.
- Positional: fastest for repeat use once you know the slots. Type the command and pause to see the `argument-hint` reminder.

Argument slots per command:

- `rewrite:author` — author string (quoted, `"Firstname Lastname <email>"`), then an optional commit count. Omit the count to rewrite the entire branch from the root.
- `rewrite:date` — a timestamp with a timezone offset, e.g. `"2026-07-14 09:30:00 +0200"`. Applies to the most recent commit only.
- `rewrite:shift-dates` — signed hours (`+2`, `-3`), then how many commits back from HEAD to shift.

Each command recommends creating a backup ref first (`git branch backup/<branch> HEAD`) so a bad rewrite is one `git reset --hard backup/<branch>` away. `rewrite:shift-dates` works on both GNU (Debian/Linux) and BSD (macOS) `date`.
