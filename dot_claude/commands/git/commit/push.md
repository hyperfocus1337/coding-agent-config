---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*)
description: Commit and push
---

## Context

- Status: !`git status -sb`
- Diff: !`git diff HEAD`

## Your task

Commit all changes above as one commit, then push the branch to origin. Use Conventional Commits with a concise subject.

Print one line: `<short sha> <subject> -> <remote branch>`. No other text.
