---
allowed-tools: Bash(mktemp:*), Bash(git rev-parse:*), Bash(git show:*), Bash(git ls-tree:*), Bash(git hash-object:*), Bash(GIT_INDEX_FILE=* git read-tree *), Bash(GIT_INDEX_FILE=* git add *), Bash(GIT_INDEX_FILE=* git apply *), Bash(GIT_INDEX_FILE=* git update-index *), Bash(GIT_INDEX_FILE=* git diff *), Bash(GIT_INDEX_FILE=* git write-tree), Bash(git commit-tree:*), Bash(git update-ref:*), Bash(git reset -q -- *), Bash(git status:*), Bash(git diff:*), Bash(git log:*)
description: Commit this conversation's changes while other sessions commit on the same branch
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat`
- Recent commits: !`git log --oneline -5`

## Your task

Commit every change this conversation made, one commit per logical unit. Leave the changes that were already in the working directory before the conversation started.

Other sessions edit files and commit on this branch at the same time. Their changes are in the same working directory and the same shared index (`.git/index`). Build each commit in a private index and move the branch only if `HEAD` did not move. Write the shared index only in step 3.6.

The conversation is the boundary: every task the user asked for, fixes you made on your own initiative, and edits a formatter or lint hook wrote to files you touched. The boundary decides what to commit, not how many commits.

If `/git:commit:plan` made a plan for this command or for `conversation` in this conversation, use its units and order, with every change the user asked for since. Still run each step below to check it.

1. **Lists.** Build the include list: every path you changed in this conversation, each tied to the action that changed it. Exclude every path that was already changed when the conversation started, or that you cannot tie to anything you did. A file can appear in both lists at hunk level. Keep the lists in your reasoning, do not print them.
2. **Group.** Group the include list into units by concern, not by file: one task vs. another, feature vs. fix vs. refactor vs. docs vs. test vs. chore. A fix you made on your own initiative is its own unit unless it only exists to make a requested change work. Hook reformatting belongs to the unit that changed the file. Order foundational changes first.
3. **Commit.** Run `mktemp -d` once and write every patch, file version, and the private index in that directory. Then per unit, with `<base>` and every SHA as the literal value that git printed:
   1. Base. Run `git rev-parse HEAD`. The output is `<base>`.
   2. Prepare. Start the private index: `GIT_INDEX_FILE=<dir>/index git read-tree <base>`. Then add the unit to it. Never run `git add`, `git apply --cached`, or `git update-index` without `GIT_INDEX_FILE=<dir>/index`.
      - A whole file, also a new or deleted file: `GIT_INDEX_FILE=<dir>/index git add -- <path>`.
      - Part of a file: write `git diff -U3 <base> -- <path>` to a patch in `<dir>`, copy this unit's hunks to a new, unused patch file in `<dir>`, and run `GIT_INDEX_FILE=<dir>/index git apply --cached <new patch>`.
      - One hunk that mixes two units, or part of a new file: write this unit's version of the file to `<dir>`, starting from `git show <base>:<path>`. Run `git hash-object -w <file>`, then `GIT_INDEX_FILE=<dir>/index git update-index --add --cacheinfo <mode>,<sha>,<path>`. Take `<mode>` from `git ls-tree <base> -- <path>`. For a new file, use `100755` for an executable file and `100644` for all other files.
   3. Check. Compare `GIT_INDEX_FILE=<dir>/index git diff --cached --name-only <base>` against the unit. For each file, read `GIT_INDEX_FILE=<dir>/index git diff --cached <base> -- <path>` and confirm every hunk is yours and sits where it belongs. If anything is wrong, return to step 3.2.
   4. Commit. Run `GIT_INDEX_FILE=<dir>/index git write-tree`, which prints `<tree>`. Run `git commit-tree <tree> -p <base> -m "<subject>"`, with one more `-m "<body>"` when the unit needs a body. It prints `<commit>`. Use Conventional Commits. If the body needs "also", split the unit.
   5. Move the branch. Run `git update-ref -m "commit: <subject>" HEAD <commit> <base>`. If it fails with `but expected`, another session committed first: return to step 3.1. After 3 failures, stop and report.
   6. Refresh the shared index. Run `git reset -q -- <unit paths>`, without `GIT_INDEX_FILE`. This sets only these paths to the new `HEAD`. If you skip it, a later commit from the shared index reverts this commit. If it fails with `index.lock`, another session writes the shared index: run it again. After 3 failures, stop and report the unit paths.
4. **Verify.** Run `git status`. Every include path must be committed, every uncommitted path must be an exclude path or a change of another session. Return to step 3 for anything missed.

If you cannot decide whether a hunk is yours, leave it out. If a git command fails, stop and report the error. Do not run the next step. The only exceptions are steps 3.5 and 3.6.

Never run `git commit`, `git stash`, `git checkout`, or `git restore`, and never write the working tree. They change the shared index or the files of other sessions.

Print one line per commit as inline code: `<short sha> <subject>`, plus `left: <count> paths` when anything stayed uncommitted. No other text.
