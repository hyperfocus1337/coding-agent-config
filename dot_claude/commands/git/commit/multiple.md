---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
description: Split changes into a logical sequence of commits
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

The working directory contains different types of changes spanning multiple unrelated improvements. Group them into a logical sequence of separate commits so each commit is self-contained and tells one part of the story.

Follow this process:

1. Review the status and diff above and identify the distinct logical units of change. Group by concern, not by file: a single file may contain hunks belonging to different commits, and a single commit may span several files. Typical boundaries are feature vs. fix vs. refactor vs. docs vs. test vs. chore/config.

2. Decide an order that keeps the history coherent and each commit independently sensible. Put foundational changes (refactors, renames, new helpers) before the changes that build on them, and keep related changes adjacent.

3. For each logical unit, stage only the files (or specific hunks via `git add -p` patterns) that belong to it, then create one commit with a clear message. Use the Conventional Commits format with a concise subject line; add a body only when the reason for the change is not obvious from the subject.

4. Repeat until the working directory is clean. Verify with `git status` between commits to confirm you are staging the intended changes and nothing is left behind unintentionally.

Stage and commit each unit using the git tools. Do not use any other tools or do anything else. Do not send any other text or messages besides these tool calls.
