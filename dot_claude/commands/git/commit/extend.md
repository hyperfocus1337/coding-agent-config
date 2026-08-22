---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git commit:*), Bash(git rebase:*)
argument-hint: [commit to extend]
description: Fold working directory changes into an existing commit
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Recent commits: !`git log --oneline -10`

## Your task

Fold the changes above into an existing commit instead of creating a new one. Target commit: $ARGUMENTS (if empty, pick the most recent commit that touched the same files, otherwise `HEAD`).

1. Stage the changes.
2. If the target is `HEAD`, run `git commit --amend --no-edit`.
3. Otherwise run `git commit --fixup <sha>`, then `GIT_SEQUENCE_EDITOR=true git rebase --autosquash <sha>~1`.

Rules:

- Keep the original commit message unless the user asks to change it.
- Do not rewrite a commit that is already pushed unless the user confirms the force-push.
- If the changes do not belong to any existing commit, say so and create a normal commit instead.
