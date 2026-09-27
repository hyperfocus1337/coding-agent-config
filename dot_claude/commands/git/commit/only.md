---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), AskUserQuestion
argument-hint: <path>...
description: Commit only the given files and folders
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat`
- Recent commits: !`git log --oneline -5`

## Your task

Commit the changes under the paths in `$ARGUMENTS` and nothing else. A path is a file or a folder. If `$ARGUMENTS` is empty, ask for the paths with AskUserQuestion, with the changed top-level paths as options.

1. **Check.** Stop if a path has no changes, and name it.
2. **Group.** Group the changes under the paths by concern. One unit makes one commit. A file that holds two units stays whole in the first unit that needs it.
3. **Commit.** Run `git add -N -- <paths>` once, so `git commit` sees new files. Then per unit, foundational units first: `git commit --only -m "<subject>" -- <unit paths>`. Use Conventional Commits.

Never run `git add` without `-N`, `git add -A`, or `git commit -a`.

If a git command fails, stop and report the error. Do not run the next step.

Print one line per commit as inline code: `<short sha> <subject>`. No other text.
