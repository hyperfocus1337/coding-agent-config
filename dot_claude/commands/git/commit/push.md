---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
description: Commit and push
---

## Context

- Status: !`git status -sb`
- Diff: !`git diff HEAD 2>/dev/null || git diff --cached`
- Recent commits: !`git log --oneline -5 2>/dev/null || echo "no commits yet"`

## Your task

Commit all changes above as one commit, then push the branch to origin. Use Conventional Commits with a concise subject.

## Output

Print one line as inline code: `<short sha> <subject> -> <remote branch>`. No other text.

When the working tree is clean, commit nothing and print `Nothing to commit. Clean: <top level>`. Then push only when the status shows `ahead`. On the next line, print `-> <remote branch>` after a push, or `Nothing to push`.
