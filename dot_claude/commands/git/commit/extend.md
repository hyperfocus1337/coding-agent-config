---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git commit:*), Bash(git rebase:*)
argument-hint: [commit to extend]
description: Fold changes into an existing commit
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat`
- Recent commits: !`git log --oneline -5`

## Your task

Fold the changes above into commit $ARGUMENTS. If that is empty, use the most recent commit that touched the same files, otherwise `HEAD`.

1. Stage the changes.
2. Target is `HEAD`: `git commit --amend --no-edit`.
3. Otherwise: `git commit --fixup <sha>`, then `GIT_SEQUENCE_EDITOR=true git rebase --autosquash <sha>~1`.

Rules:

- Keep the original message unless the user asks to change it.
- Do not rewrite a pushed commit unless the user confirms the force-push.
- If the changes belong to no existing commit, say so and make a normal commit instead.

Print one line as inline code: `<short sha> <subject>` and how you folded it (amend or fixup). No other text.
