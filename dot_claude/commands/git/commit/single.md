---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
description: Create a single git commit
---

## Context

- Status: !`git status -sb`
- Diff: !`git diff HEAD`
- Recent commits: !`git log --oneline -5`

## Your task

Commit all changes above as one commit. Use Conventional Commits with a concise subject. Add a body only when the subject does not carry the reason.

Stage and commit in one Bash call. Then print one line as inline code: `<short sha> <subject>`. No other tools, no other text.
