---
allowed-tools: Bash(git init:*), Bash(git status:*)
argument-hint: [directory]
description: Create a git repository with a main branch
disable-model-invocation: true
---

## Your task

Run `git init -b main $ARGUMENTS`. Without an argument, it initializes the current directory.

If the target is already a repository, `git init` leaves it unchanged. Say so in one line.

Print the output of `git init`. No other text.
