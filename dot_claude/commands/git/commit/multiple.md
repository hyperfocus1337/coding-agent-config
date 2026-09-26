---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git apply:*), Bash(git show:*), Bash(git hash-object:*), Bash(git update-index:*), Bash(git ls-files:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
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
3. **Commit.** Per unit:
   1. Stage the unit. Never `git add -A`, `git add .`, `git add -u`, or `git commit -a`.
      - A whole file: `git add <path>`.
      - Part of a file: write `git diff -U3 -- <path>` to a patch outside the repository, keep only this unit's hunks, and run `git apply --cached <patch>`.
      - One hunk that mixes two units: write this unit's version of the file to a file outside the repository, starting from `git show :<path>`. Then run `git hash-object -w <file>` and `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`.
   2. Check the stage. Compare `git diff --cached --name-only` against the unit and unstage anything extra with `git restore --staged <path>`. For each partly staged file, read `git diff --cached -- <path>` and confirm every hunk sits where it belongs.
   3. Commit with Conventional Commits.
4. **Repeat.** Continue until `git status` is clean.

If a git command fails, stop and report the error. Do not run the next step.

Print one line per commit as inline code: `<short sha> <subject>`. No other text.
