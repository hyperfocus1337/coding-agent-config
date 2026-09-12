---
allowed-tools: Bash(chezmoi diff:*), Bash(chezmoi apply:*)
description: Apply the chezmoi source state to the home directory
disable-model-invocation: true
---

## Context

- Pending changes: !`chezmoi diff --no-pager`

## Your task

Run `chezmoi apply $ARGUMENTS`. Report which files changed. If the diff above is empty, say nothing is pending and stop.
