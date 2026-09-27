---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git apply:*), Bash(git show:*), Bash(git hash-object:*), Bash(git update-index:*), Bash(git ls-files:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
description: Commit this conversation's changes as scoped commits
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat`
- Recent commits: !`git log --oneline -5`

## Your task

Commit every change this conversation made, one commit per logical unit. Leave the changes that were already in the working directory before the conversation started.

The conversation is the boundary: every task the user asked for, fixes you made on your own initiative, and edits a formatter or lint hook wrote to files you touched. The boundary decides what to commit, not how many commits.

If `/git:commit:plan` made a plan for this command in this conversation, use its units and order, with every change the user asked for since. Still run each step below to check it.

1. **Lists.** Build the include list: every path you changed in this conversation, each tied to the action that changed it. Exclude every path that was already changed when the conversation started, or that you cannot tie to anything you did. A file can appear in both lists at hunk level. Keep the lists in your reasoning, do not print them.
2. **Group.** Group the include list into units by concern, not by file: one task vs. another, feature vs. fix vs. refactor vs. docs vs. test vs. chore. A fix you made on your own initiative is its own unit unless it only exists to make a requested change work. Hook reformatting belongs to the unit that changed the file. Order foundational changes first.
3. **Commit.** Per unit:
   1. Stage the unit. Never `git add -A`, `git add .`, `git add -u`, or `git commit -a`.
      - A whole file: `git add <path>`.
      - Part of a file: write `git diff -U3 -- <path>` to a patch outside the repository, keep only this unit's hunks, and run `git apply --cached <patch>`.
      - One hunk that mixes two units: write this unit's version of the file to a file outside the repository, starting from `git show :<path>`. Then run `git hash-object -w <file>` and `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`.
   2. Check the stage. Compare `git diff --cached --name-only` against the unit and unstage anything extra with `git restore --staged <path>`. For each partly staged file, read `git diff --cached -- <path>` and confirm every hunk sits where it belongs.
   3. Commit with Conventional Commits. If the body needs "also", split the unit.
4. **Verify.** Run `git status`. Every include path must be committed, every uncommitted path must be an exclude path. Return to step 3 for anything missed.

If you cannot decide whether a hunk is yours, leave it out. If a git command fails, stop and report the error. Do not run the next step.

Do not edit files. Print one line per commit as inline code: `<short sha> <subject>`, plus `left: <count> paths` when anything stayed uncommitted. No other text.
