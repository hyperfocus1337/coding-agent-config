---
allowed-tools: Bash(git commit:*), Bash(git log:*), Bash(git branch:*), Bash(git status:*)
description: Set an absolute commit and author date on the most recent commit.
argument-hint: timestamp with timezone offset (optional; asked if omitted)
---

## Context

- Current branch: !`git branch --show-current`
- Most recent commit: !`git log --pretty=format:'%h %ci %an <%ae> %s' -1`

## Your task

Set an explicit timestamp on the most recent commit (both committer and author date).

`$1` below is a slash-command argument, substituted before the command runs. It is not a shell positional variable.

Arguments: `$ARGUMENTS`

- `$1` (required): the timestamp, e.g. `"2026-07-14 09:30:00 +0200"` or any format git accepts. Include a timezone offset to avoid it being read in the local zone. If missing, ask for it.

## Safety

This rewrites the HEAD commit and changes its hash. Before running:

- Recommend a backup ref so a bad amend is one command to undo: `git branch backup/$(git branch --show-current) HEAD`. Recover with `git reset --hard backup/<branch>`.
- If it was already pushed, the user needs a force-push (`git push --force-with-lease`).
- Confirm before running.

## Command to execute

```bash
GIT_COMMITTER_DATE="$1" GIT_AUTHOR_DATE="$1" git commit --amend --no-edit --reset-author
```

Note: `--reset-author` also resets the author identity (name and email) to the current git config, not just the date. If the user only wants to change the date and keep the existing author, drop `--reset-author`:

```bash
GIT_COMMITTER_DATE="$1" GIT_AUTHOR_DATE="$1" git commit --amend --no-edit --date "$1"
```

After amending, show `git log --pretty=format:'%h %ci %an <%ae> %s' -1` to verify.
