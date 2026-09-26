---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
description: Commit and push
---

## Context

- Status: !`git status -sb`
- Diff: !`git diff HEAD`
- Recent commits: !`git log --oneline -5`

## Your task

Commit all changes above as one commit, then push the branch to origin. Use Conventional Commits with a concise subject.

Print one line as inline code: `<short sha> <subject> -> <remote branch>`. No other text.
