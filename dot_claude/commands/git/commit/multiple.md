---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git apply:*), Bash(git show:*), Bash(git hash-object:*), Bash(git update-index:*), Bash(git ls-files:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Bash(git -C * rev-parse *), Bash(git -C * add *), Bash(git -C * restore --staged *), Bash(git -C * apply *), Bash(git -C * show *), Bash(git -C * hash-object *), Bash(git -C * update-index *), Bash(git -C * ls-files *), Bash(git -C * status *), Bash(git -C * commit *), Bash(git -C * diff *), Bash(git -C * log *)
description: Split changes into several commits
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat 2>/dev/null || git diff --cached --stat`
- Recent commits: !`git log --oneline -5 2>/dev/null || echo "no commits yet"`

## Your task

Split the changes into one commit per logical unit.

This conversation can also edit files in other git repositories. Run `git -C <dir> rev-parse --show-toplevel` for `.` and for the nearest existing directory of each file you edited. Each top level other than the one for `.` is an external repository. Skip a file that is in no repository.

Run the steps below in this repository first, then in each external repository, with `-C <repo>` after `git` in every git command. In an external repository, commit every change in its working directory, not only the edits of this conversation.

If `/git:commit:plan` made a plan for this command in this conversation, use its units and order, with every change the user asked for since. Still run each step below to check it.

1. **Group.** Group by concern, not by file: feature vs. fix vs. refactor vs. docs vs. test vs. chore. One file can hold two units. One unit can span several files.
2. **Order.** Order the units so foundational changes (renames, new helpers, refactors) come before what builds on them.
3. **Commit.** Per unit:
   1. Stage the unit. Never `git add -A`, `git add .`, `git add -u`, `git commit -a`, or `git apply --unidiff-zero`.
      - A whole file: `git add <path>`.
      - Part of a file: write `git diff -U3 -- <path>` to a patch outside the repository, copy this unit's hunks, picked by their text, to a new, unused patch file, and run `git apply --cached <new patch>`.
      - One hunk that mixes two units: write this unit's version of the file to a file outside the repository, starting from `git show :<path>`. Then run `git hash-object -w <file>` and `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`.
   2. Check the stage. Compare `git diff --cached --name-only` against the unit and unstage anything extra with `git restore --staged <path>`. For each partly staged file, read `git diff --cached -- <path>` and confirm every hunk is in this unit and sits where it belongs.
   3. In a new Bash call, after you read the check, commit with Conventional Commits.
4. **Repeat.** Continue until `git status` is clean.

If a git command fails, stop and report the error. Do not run the next step.

Print one line per commit as inline code: `<short sha> <subject>`. Before the lines of an external repository, print its top level on its own line. No other text.
