---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git apply:*), Bash(git hash-object:*), Bash(git update-index:*), Bash(git ls-files:*), Bash(git reset --soft:*), Bash(git rev-parse:*), Bash(git rev-list:*)
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
4. **Commit.** Per unit:
   1. Stage the unit. Never `git add -A`, `git add .`, `git add -u`, or `git commit -a`.
      - A whole file: `git add <path>`.
      - Part of a file: write `git diff -U3 -- <path>` to a patch outside the repository, keep only this unit's hunks, and run `git apply --cached <patch>`.
      - One hunk that mixes two units: write this unit's version of the file to a file outside the repository, starting from `git show :<path>`. Then run `git hash-object -w <file>` and `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`.
   2. Check the stage. Compare `git diff --cached --name-only` against the unit and unstage anything extra with `git restore --staged <path>`. For each partly staged file, read `git diff --cached -- <path>` and confirm every hunk sits where it belongs.
   3. Commit with Conventional Commits. Reuse the original subject for the unit it describes.
5. **Repeat.** Continue until `git status` is clean and `git diff <original sha>` is empty.

If a git command fails, stop and report the error. Do not run the next step.

Print one line per commit as inline code: `<short sha> <subject>`. No other text.
