---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git apply:*), Bash(git show:*), Bash(git hash-object:*), Bash(git update-index:*), Bash(git ls-files:*), Bash(git status:*), Bash(git --no-optional-locks status:*), Bash(sleep 10), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Bash(git -C * rev-parse *), Bash(git -C * add *), Bash(git -C * restore --staged *), Bash(git -C * apply *), Bash(git -C * show *), Bash(git -C * hash-object *), Bash(git -C * update-index *), Bash(git -C * ls-files *), Bash(git -C * status *), Bash(git -C * commit *), Bash(git -C * diff *), Bash(git -C * log *)
description: Commit this conversation's changes as scoped commits
---

## Context

- Status: !`git --no-optional-locks status -sb`
- Change size per file: !`git diff HEAD --stat 2>/dev/null || git diff --cached --stat`
- Recent commits: !`git log --oneline -5 2>/dev/null || echo "no commits yet"`

## Your task

Commit every change this conversation made, one commit per logical unit. Leave the changes that were already in the working directory before the conversation started.

The conversation is the boundary: every task the user asked for, fixes you made on your own initiative, and edits a formatter or lint hook wrote to files you touched. The boundary decides what to commit, not how many commits.

If `/git:commit:plan` made a plan for this command in this conversation, use its units and order, with every change the user asked for since. Still run each step below to check it.

1. **Repositories.** Run `git -C <dir> rev-parse --show-toplevel` for `.` and for the nearest existing directory of each file you edited.
   - Each top level other than the one for `.` is a candidate.
   - `not a git repository` is an expected result, not a failure: the file is in no repository and stays out.
   - A candidate is an external repository unless it is a disposable fixture, such as a test or pilot repository made to try something, or holds only generated output. Commit in such a repository only when the user asks for it.
   - Run the next steps in this repository first, then in each external repository, with `-C <repo>` after `git` in every git command.
2. **Lists.** Build the include list: every path you changed in this conversation, each tied to the action that changed it. Exclude every path that was already changed when the conversation started, or that you cannot tie to anything you did. A file can appear in both lists at hunk level. Keep the lists in your reasoning, do not print them.
3. **Group.** Group the include list into units by concern, not by file: one task vs. another, feature vs. fix vs. refactor vs. docs vs. test vs. chore. A fix you made on your own initiative is its own unit unless it only exists to make a requested change work. Hook reformatting belongs to the unit that changed the file. Order foundational changes first.
4. **Commit.** Per unit:
   1. Stage the unit. Never `git add -A`, `git add .`, `git add -u`, `git commit -a`, or `git apply --unidiff-zero`.
      - A whole file: `git add <path>`.
      - Part of a file: write `git diff -U3 -- <path>` to a patch outside the repository, copy this unit's hunks, picked by their text, to a new, unused patch file, and run `git apply --cached <new patch>`.
      - One hunk that mixes two units: write this unit's version of the file to a file outside the repository, starting from `git show :<path>`. Then run `git hash-object -w <file>` and `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`.
   2. Check the stage. Compare `git diff --cached --name-only` against the unit and unstage anything extra with `git restore --staged <path>`. For each staged file, read `git diff --cached -- <path>` and confirm every hunk is in this unit and sits where it belongs.
   3. In a new Bash call, after you read the check, commit with Conventional Commits. If the body needs "also", split the unit.
5. **Verify.** Run `git --no-optional-locks status`. Every include path must be committed, every uncommitted path must be an exclude path. Return to step 4 for anything missed.

If you cannot decide whether a hunk is yours, leave it out.

Run git commands one at a time, each in its own Bash call or chained with `&&`, so that a failure stops the commands after it. If a git command fails, stop and report the error. Do not run the next step.

The one exception is a staging command that fails with `Unable to create '<lock>': File exists`: another process holds the index lock. Run `sleep 10 && git diff --cached --name-only`. If the stage holds only your changes, run the failed command once more. Never touch the lock file, and never run `git commit` twice.

Do not edit files. Print one line per commit as inline code: `<short sha> <subject>`, plus `left: <count> paths` when anything stayed uncommitted. Before the lines of an external repository, print its top level on its own line. No other text.
