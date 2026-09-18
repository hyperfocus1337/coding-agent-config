---
disable-model-invocation: true
---

# git slash commands

Shorthand command names and what they map to.

## Commit

Stage and commit working directory changes.

| Command               | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `commit:any`          | Route to the commit command that fits the changes       |
| `commit:single`       | Create a git commit                                     |
| `commit:task`         | Commit one task's changes from the current conversation |
| `commit:conversation` | Commit this conversation's changes as scoped commits    |
| `commit:multiple`     | Split changes into several commits                      |
| `commit:extend`       | Fold changes into an existing commit                    |
| `commit:split`        | Split the previous commit into separate commits         |
| `commit:push`         | Commit and push                                         |

### Choosing a commit command

Run `commit:any` to have the choice made for you. It reads the tree and routes to one of the commands below, then that command runs its own process. Pick a command yourself when you already know which one you want, or when you want no routing step in front of it.

The four commit commands differ on two axes: which changes they take, and how many commits they make.

| Scope of changes                     | One commit      | Many commits          |
| ------------------------------------ | --------------- | --------------------- |
| Whole working directory              | `commit:single` | `commit:multiple`     |
| Everything this conversation changed | (none)          | `commit:conversation` |
| One task from this conversation      | `commit:task`   | (none)                |

`commit:single` and `commit:multiple` take every change in the working directory, including changes that were there before the conversation started.

`commit:conversation` and `commit:task` build an include list and an exclude list before they stage, and leave pre-existing changes uncommitted. Every commit command prints one line per commit and nothing else.

`commit:task` takes an optional scope argument; without one it takes the last request in the conversation. `commit:extend` folds changes into an existing commit instead of creating one. `commit:split` does the reverse: it undoes `HEAD` and recommits it as one commit per logical unit. It takes the reason for the split as its argument.

### How `commit:any` routes

It decides the same two axes, then adds two checks the table does not cover.

1. No changed paths: it says the tree is clean and stops.
2. The changes only touch paths the most recent commit touched, they correct that commit, and the commit is unpushed: it routes to `commit:extend`.
3. Scope: a changed path it cannot tie to this conversation means foreign changes are present, so it picks a conversation command, which excludes them. When the session started at the command it has no history to tie paths to, so it picks a working directory command.
4. Count: one logical unit picks the one-commit command, two or more pick the many-commits command.

Its argument is a free-text hint. It passes the hint on when it routes to `commit:task`, which is the only target that takes one.

Routing works because every command in the table above stays model-invocable. Adding `disable-model-invocation: true` to one of them removes it as a target, and `commit:any` loses that route without reporting an error. `commit:any` itself carries the flag: it runs only when typed, so nothing commits by routing on its own.

## Push and pull requests

Send commits to a remote and open pull requests.

| Command     | Description                                                |
| ----------- | ---------------------------------------------------------- |
| `push`      | Push the current branch to origin, ask about other remotes |
| `pr:create` | Commit, push, and open a PR                                |

## Branches and worktrees

Remove stale branches and worktrees, and configure worktree paths.

| Command               | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `branches:cleanup`    | Delete gone or merged branches, after confirmation          |
| `worktrees:cleanup`   | Remove worktrees + delete their `[gone]` branches           |
| `worktrees:configure` | Set `worktree.useRelativePaths` for container + host access |

`branches:cleanup` deletes two classes of local branch and keeps everything else, after you confirm an overview of the candidates. See [`branches/README.md`](branches/README.md) for the full include and exclude list, how the default branch is resolved, and why squash merges are not detected.

## History

Summarize or rewrite existing commits.

| Command               | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `changelog`           | Generate a changelog for a time period               |
| `revert`              | Undo the commits this conversation made              |
| `rewrite:author`      | Rewrite author of the whole branch or last N commits |
| `rewrite:date`        | Set an absolute date on the most recent commit       |
| `rewrite:shift-dates` | Shift dates of the last N commits by hours           |

`revert` is the counterpart to the commit commands: it selects the commits by the same conversation boundary they use, then undoes them. It takes a scope argument the same way `commit:task` does, and also accepts a plain commit count. It keeps the file changes in the working directory, unstaged, so the undo loses nothing. The method depends on the commits: unpushed commits that sit contiguous at `HEAD` are dropped with `git reset --mixed`, and pushed commits or a non-contiguous set get `git revert` commits instead. Ask for the changes to be discarded if you want that; the command never does it on its own.

`rewrite:author`, `rewrite:date`, and `rewrite:shift-dates` rewrite git history, so they all show current commits, warn about force-pushing, and confirm before running. There is no named-argument (`--flag`) syntax in slash commands, only positional slots and free text, so each command is written to be called three ways:

- Bare, then interviewed: run the command with no arguments and answer the questions it asks. You never need to remember argument order, and you see the affected commits before anything changes. This is the safest default.
- Natural language: describe the values after the command, e.g. `/git:rewrite:author "Jane Doe <jane@x.com>" last 5 commits`. The intent is parsed, so order does not have to be exact.
- Positional: fastest for repeat use once you know the slots. Type the command and pause to see the `argument-hint` reminder.

Argument slots per command:

- `rewrite:author` — author string (quoted, `"Firstname Lastname <email>"`), then an optional commit count. Omit the count to rewrite the entire branch from the root.
- `rewrite:date` — a timestamp with a timezone offset, e.g. `"2026-07-14 09:30:00 +0200"`. Applies to the most recent commit only.
- `rewrite:shift-dates` — signed hours (`+2`, `-3`), then how many commits back from HEAD to shift.

Each command recommends creating a backup ref first (`git branch backup/<branch> HEAD`) so a bad rewrite is one `git reset --hard backup/<branch>` away. `rewrite:shift-dates` works on both GNU (Debian/Linux) and BSD (macOS) `date`.
