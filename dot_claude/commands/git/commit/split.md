---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git reset --soft:*), Bash(git rev-parse:*), Bash(git rev-list:*)
argument-hint: <why the split is needed>
description: Split the previous commit into separate commits
disable-model-invocation: true
---

## Context

- Status: !`git status -sb`
- Previous commit: !`git show --stat HEAD`
- Unpushed: !`git rev-list --count @{upstream}..HEAD 2>/dev/null || echo "no upstream"`

## Your task

Split `HEAD` into one commit per logical unit. The reason for the split: $ARGUMENTS. Use it to identify which changes do not belong together.

1. **Check.** Stop if the tree is not clean, or if `HEAD` is pushed and the user has not confirmed a force-push. Stop if `$ARGUMENTS` is empty and ask why the split is needed.
2. **Undo.** `git reset --soft HEAD~1`, then `git restore --staged .` so every change of the commit is unstaged.
3. **Group.** Group by concern, not by file. One file can hold two units. Order foundational changes first.
4. **Commit.** Per unit, stage only its paths, or its hunks with `git add -p`. Never `git add -A`, `git add .`, `git add -u`, or `git commit -a`. Check `git diff --cached --name-only` against the unit, unstage anything extra with `git restore --staged <path>`, then commit with Conventional Commits. Reuse the original subject for the unit it describes.
5. **Repeat.** Continue until `git status` is clean and `git diff <original sha>` is empty.

Print one line per commit: `<short sha> <subject>`. No other text.
