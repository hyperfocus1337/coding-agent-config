---
allowed-tools: Bash(chezmoi diff:*)
description: Show the diff between the chezmoi source state and the home directory
disable-model-invocation: true
---

## Context

- Diff: !`chezmoi diff --no-pager $ARGUMENTS`

## Your task

Summarize the diff above per file: what changes and why it likely differs. If it is empty, say the home directory matches the source state.
