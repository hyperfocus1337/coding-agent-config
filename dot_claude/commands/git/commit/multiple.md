---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
description: Split changes into several commits
---

## Context

- Status: !`git status -sb`
- Diff: !`git diff HEAD`
- Recent commits: !`git log --oneline -5`

## Your task

Split the changes into one commit per logical unit.

1. **Group.** Group by concern, not by file: feature vs. fix vs. refactor vs. docs vs. test vs. chore. One file can hold two units. One unit can span several files.
2. **Order.** Order the units so foundational changes (renames, new helpers, refactors) come before what builds on them.
3. **Commit.** Per unit, stage only its paths, or its hunks with `git add -p`. Never `git add -A`, `git add .`, `git add -u`, or `git commit -a`. Check `git diff --cached --name-only` against the unit, unstage anything extra with `git restore --staged <path>`, then commit with Conventional Commits.
4. **Repeat.** Continue until `git status` is clean.

Print one line per commit: `<short sha> <subject>`. No other text.
