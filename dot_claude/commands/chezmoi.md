---
allowed-tools: Bash(chezmoi diff:*), Bash(chezmoi apply:*), Bash(chezmoi add:*), Bash(chezmoi managed:*), Bash(git ls-tree:*), Bash(git rev-parse:*), Bash(grep:*)
argument-hint: diff | apply | add <path> [path...]
description: Diff, apply, or add chezmoi files, with the current repository as the source when it is a chezmoi source
disable-model-invocation: true
---

## Context

- Source: !`git ls-tree --name-only --full-tree HEAD 2>/dev/null | grep -qE '^(\.chezmoi|dot_)' && git rev-parse --show-toplevel || echo default`

## Your task

Run the subcommand `$ARGUMENTS`. Pass `--source <Source>` to every chezmoi call, unless Source is `default`.

- `diff [path...]`: Run `chezmoi diff --no-pager`. Summarize the diff per file: what changes and why it likely differs. If it is empty, say the home directory matches the source state.
- `apply [path...]`: Run `chezmoi diff --no-pager`. If it is empty, say nothing is pending and stop. Otherwise run `chezmoi apply` and report which files changed.
- `add <path> [path...]`: If no path is given, ask for one. Run `chezmoi add`. Report the source path chezmoi created or updated.
- No subcommand, or another one: ask which subcommand to run.
