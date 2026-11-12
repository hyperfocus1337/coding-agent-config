---
allowed-tools: Bash(mktemp:*), Bash(git rev-parse:*), Bash(git show:*), Bash(git ls-tree:*), Bash(git hash-object:*), Bash(GIT_INDEX_FILE=* git read-tree *), Bash(GIT_INDEX_FILE=* git add *), Bash(GIT_INDEX_FILE=* git apply *), Bash(GIT_INDEX_FILE=* git update-index *), Bash(GIT_INDEX_FILE=* git diff *), Bash(GIT_INDEX_FILE=* git write-tree), Bash(git commit-tree:*), Bash(git update-ref:*), Bash(git reset -q -- *), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(python3 */.claude/commands/git/commit/scripts/parallel/commit-parallel.py *)
description: Commit this conversation's changes, safe when other sessions commit at the same time
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat 2>/dev/null || git diff --cached --stat`
- Recent commits: !`git log --oneline -5 2>/dev/null || echo "no commits yet"`

## Your task

Commit every change this conversation made, one commit per logical unit. Leave the changes that were already in the working directory before the conversation started.

Other sessions edit files and commit on this branch at the same time. Their changes are in the same working directory and the same shared index (`.git/index`). Build each commit in a private index and move the branch only if `HEAD` did not move. Only the publish helper may write the shared index, after its branch update succeeds.

The conversation is the boundary: every task the user asked for, fixes you made on your own initiative, and edits a formatter or lint hook wrote to files you touched. The boundary decides what to commit, not how many commits.

If `/git:commit:plan` made a plan for this command or for `conversation` in this conversation, use its units and order, with every change the user asked for since. Still run each step below to check it.

1. **Lists.** Build the include list: every path you changed in this conversation, each tied to the action that changed it.
   - Exclude every other path.
   - A file can appear in both lists at hunk level. If you cannot decide whether a hunk is yours, leave it out.
   - Keep the lists in your reasoning, do not print them.
2. **Group.** Group the include list into units by concern, not by file: one task vs. another, feature vs. fix vs. refactor vs. docs vs. test vs. chore. A fix you made on your own initiative is its own unit unless it only exists to make a requested change work. Hook reformatting belongs to the unit that changed the file. Order foundational changes first.
3. **Commit.** Run `mktemp -d` once and write every patch, file version, and the private index in that directory. Work from the repository root. Then per unit, with `<base>` and every SHA as the literal value that git printed:
   1. Base. Run `git rev-parse HEAD`. The output is `<base>`.
   2. Prepare. Start the private index: `GIT_INDEX_FILE=<dir>/index git read-tree <base>`. Then add the unit to it. Never run `git add`, `git apply --cached`, or `git update-index` without `GIT_INDEX_FILE=<dir>/index`.
      - A whole file, also a new or deleted file: `GIT_INDEX_FILE=<dir>/index git add -- <path>`.
      - Part of a file: write `git diff -U3 <base> -- <path>` to a patch in `<dir>`, copy this unit's hunks, picked by their text, to a new, unused patch file in `<dir>`, and run `GIT_INDEX_FILE=<dir>/index git apply --cached <new patch>`.
      - One hunk that mixes two units, or part of a new file: write this unit's version of the file to `<dir>`, starting from `git show <base>:<path>`. Run `git hash-object -w <file>`, then `GIT_INDEX_FILE=<dir>/index git update-index --add --cacheinfo <mode>,<sha>,<path>`. Take `<mode>` from `git ls-tree <base> -- <path>`. For a new file, use `100755` for an executable file and `100644` for all other files.
   3. Check. Compare `GIT_INDEX_FILE=<dir>/index git diff --cached --name-only <base>` against the unit. For each file, read `GIT_INDEX_FILE=<dir>/index git diff --cached <base> -- <path>` and confirm every hunk is in this unit and sits where it belongs. If anything is wrong, return to step 3.2.
   4. Snapshot. Save the reviewed unit to a new patch: `GIT_INDEX_FILE=<dir>/index git diff --cached --binary --full-index --no-renames <base> > <dir>/unit-N.patch`. This patch is immutable. Use Conventional Commits for the subject; if the body needs "also", split the unit before publishing.
   5. Publish. In a new Bash call, after you read the check, run `python3 "$HOME/.claude/commands/git/commit/scripts/parallel/commit-parallel.py" <dir>/index <base> <dir>/unit-N.patch "<subject>"`, with one more quoted argument for an optional body. The helper checks the snapshot against the private index, then runs `write-tree`, `commit-tree`, and the compare-and-swap `update-ref` without model turns between them. It never runs `git add` or reads working files.
      - It retries only an expected `HEAD` mismatch, at most 10 attempts within a 30-second retry window, with short randomized waits. Before retrying on a new base, it rebuilds the private index and applies only the saved patch. The retry window does not interrupt a Git process already running.
      - If the patch no longer applies cleanly, stop automatic retries and inspect the overlap. Return to step 3.1 only after reviewing ownership again; never resolve an overlap automatically.
      - If concurrent updates exhaust retries, report that reviewed changes remain pending. Do not report that there is nothing to commit.
      - After publication, the helper prints the short SHA and subject, then refreshes only the unit paths in the shared index with `git reset -q -- <unit paths>`. It retries `index.lock` errors up to 3 times and never removes the lock. If refresh fails, report the existing commit and affected paths; do not publish that unit again.
4. **Verify.** Run `git status`. Every include path must be committed. Every uncommitted path must be an exclude path or a change of another session. Return to step 3 for anything missed.

## Rules

- If a git command fails, stop and report the error, except for the helper's bounded `HEAD`-mismatch and shared-index-lock retries. Do not repeat the publish call blindly after an error: it may already have created a commit.
- Never run `git commit`, `git stash`, `git checkout`, or `git restore`, and never write the working tree. They change the shared index or the files of other sessions.

## Output

- Print one line per commit as inline code: `<short sha> <subject>`.
- When anything stayed uncommitted, add `left: <count> paths`.
- No other text.
- When you make no commit:
  - If the working tree is clean, print `Nothing to commit. Clean: <top level>`.
  - If no conversation changes remain, print `Nothing to commit from this conversation` and the `left:` line.
  - If publication failed, print `Not committed: <reason>. Reviewed changes remain pending.` and the `left:` line instead.
- If shared-index refresh failed after publication, print the commit line and `Index refresh failed: <paths>`, then the `left:` line. This is an error report, not a request to commit the unit again.
