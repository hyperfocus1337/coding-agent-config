---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git commit:*), Bash(git rebase:*)
argument-hint: [commit to extend]
description: Fold changes into one or more existing commits
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat`
- Recent commits: !`git log --oneline -5`

## Input

The arguments optionally identify the commit to extend.

<arguments>
$ARGUMENTS
</arguments>

## Your task

Fold the changes above into existing commits. A target can be any earlier commit on the branch, not only `HEAD` or the commits listed above. Different files can go to different commits.

If `/git:commit:plan` made a plan for this command in this conversation, use its targets, with every change the user asked for since. Still run each step below to check it.

1. Find the target of each changed file:
   - If the text inside `<arguments>` names a commit, all changes go to that commit.
   - Otherwise, run `git log --oneline -- <file>` and pick the commit that the change completes or corrects, usually the most recent one that touched the file.
2. If all targets are `HEAD`, stage the changes, run `git commit --amend --no-edit`, and stop.
3. Otherwise, for each target, stage only its files, then run `git commit --fixup <sha>`.
4. Run one rebase from the parent of the oldest target: `git rebase --autosquash --autostash <oldest sha>~1`. If the oldest target is the root commit, use `--root` instead of `<oldest sha>~1`.

## Rules

- The rebase rewrites the oldest target and every commit after it. If one of them is pushed, do not rewrite until the user confirms the force-push.
- If one file holds changes for different commits, ask the user before you stage it.
- If a change belongs to no existing commit, say so and make a normal commit for it instead.

## Output

Print one line per target as inline code: `<short sha> <subject>` and how you folded it (amend or fixup). No other text.

When the working tree is clean, fold nothing and print `Nothing to fold. Clean: <top level>`.
