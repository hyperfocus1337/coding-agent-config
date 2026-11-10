---
allowed-tools: Bash(git push:*), Bash(git remote:*), Bash(git status:*), Bash(git log:*), AskUserQuestion
description: Push the current branch to origin, and ask about any other remote
---

## Context

- Status: !`git status -sb`
- Remotes: !`git remote -v`

## Your task

Run `git push origin HEAD`. Add `-u` if the branch has no upstream.

If other remotes exist, ask with `AskUserQuestion` which ones to push to as well: one option per remote plus `Origin only`, with `multiSelect: true`. Push to each selected remote.

Start with one sentence that gives the number of pushed commits and the remotes, for example `Pushed 3 commits to origin.` Then print one line per pushed commit as inline code: `<short sha> <subject>`, plus `left: <count> paths` when anything stayed uncommitted. If a push fails, print its error instead. No other text.
