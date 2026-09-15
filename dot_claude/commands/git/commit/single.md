---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
description: Create a single git commit
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Based on the above changes, create a single git commit. Use the Conventional Commits format with a concise subject line. Add a body only when the reason for the change is not obvious from the subject.

Stage and commit in one Bash call. Do not use any other tools or do anything else. Do not send any other text or messages besides this tool call.
