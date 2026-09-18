---
allowed-tools: Bash(git log:*), Bash(git status:*), Bash(git branch:*), Bash(git show:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git reset --mixed:*), Bash(git revert:*), AskUserQuestion
argument-hint: [scope, or a commit count]
description: Undo the commits this conversation made
disable-model-invocation: true
---

## Context

- Status: !`git status -sb`
- Recent commits: !`git log --pretty=format:'%h %s' -10`
- Unpushed: !`git rev-list --count @{upstream}..HEAD 2>/dev/null || echo "no upstream"`

## Your task

Undo the commits this conversation made. Keep their changes in the working directory.

1. **Select.** `$ARGUMENTS` is empty (the last task), a number (that many commits back), or text naming a task. Match commits by subject and touched paths.
2. **Stop** and report when the list is empty, holds a commit you did not make, holds a merge, or the session started here with no history to match against.
3. **Back up.** `git branch backup/$(git branch --show-current) HEAD`. Recovery is `git reset --hard backup/<branch>`.
4. **Confirm** the commits, the method, and the outcome with `AskUserQuestion`.
5. **Run.** Unpushed and contiguous from `HEAD`: `git reset --mixed <base>`, where `<base>` precedes the oldest selected commit. Otherwise `git revert --no-commit <sha>...`, newest first, then commit per unit with Conventional Commits. `git revert` needs a clean tree: if the tree is dirty, stop and name the paths.
6. **Verify** with `git status` and `git log --oneline -5`.

Do not edit files, force-push, or `git reset --hard`. Discarding the changes needs a separate request: say so in one line.

Print the method, `<short sha> <subject>` per commit, and the backup ref. Nothing else.
