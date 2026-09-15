---
allowed-tools: Bash(git add:*), Bash(git reset:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
description: Commit every change from the current conversation as a sequence of scoped commits
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Commit every change this conversation made, split into one commit per logical unit. Leave only the changes that were already in the working directory before the conversation started.

The conversation is the boundary. Everything you changed inside it is in scope: every task the user asked for, fixes you made on your own initiative, and edits a formatter or lint hook wrote to files you touched. The boundary decides what to commit. It does not decide how many commits: one conversation holds several units, and each unit gets its own commit.

Follow this process:

1. Build the include list: every path you changed in this conversation. For each path, name the request or the action that made you change it. Build the exclude list: every path in the status above that was already changed when the conversation started, or that you cannot tie to anything you did. If a file carries both kinds of hunks, list it in both lists and name the hunks.

2. Print both lists before you stage anything. One path per line with a one-line reason.

3. Group the include list into logical units. Group by concern, not by file: a single file may hold hunks that belong to different units, and a single unit may span several files. Typical boundaries are one task vs. another task, feature vs. fix vs. refactor vs. docs vs. test vs. chore. A fix you made on your own initiative is its own unit unless it only exists to make a requested change work. Reformatting a hook applied to a file you changed belongs to the unit that changed the file. Order the units so that foundational changes (renames, new helpers, refactors) come before the changes that build on them.

4. Print the units: one line per unit with the planned subject line and its paths.

5. For each unit in order:

   - Stage only its paths, naming every path explicitly. If a path also carries hunks from another unit or from the exclude list, stage only this unit's hunks with `git add -p`. Never use `git add -A`, `git add .`, `git add -u`, or `git commit -a`.
   - Run `git diff --cached --name-only` and compare it against the unit's paths. If they differ, `git reset` the extra paths and repeat until they match.
   - Commit. Use the Conventional Commits format with a concise subject line. Add a body only when the reason for the change is not obvious from the subject. If the body needs the word "also", split the unit: unstage the extra change, give it its own unit, and continue.

6. Run `git status`. Every path in the include list must be committed. Every path that stays uncommitted must be in the exclude list. If a path from the include list is still uncommitted, return to step 5 for it. Report the paths that stayed uncommitted with their reason.

If you cannot decide whether a hunk is yours or was already there, leave it out and say so in the step 6 report.

Do not edit files. Use the git tools plus the lists from steps 2 and 4 and the report from step 6. Send no other text.
