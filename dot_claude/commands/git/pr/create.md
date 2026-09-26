---
allowed-tools: Bash(git switch -c:*), Bash(git add:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr create:*)
description: Commit, push, and open a PR
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -5`

## Your task

Based on the above changes:

1. Create a new branch with `git switch -c` if on main
2. Create a single commit with an appropriate message
3. Push the branch to origin
4. Create a pull request using `gh pr create`
5. Run the four steps in one Bash call, chained with `&&`, so a failed step stops the rest. Do not use any other tools or send any other text.
