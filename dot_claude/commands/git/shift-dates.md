---
allowed-tools: Bash(git rebase:*), Bash(git log:*), Bash(git branch:*), Bash(git status:*)
description: Shift the commit dates of the last N commits by a number of hours (macOS/BSD date).
argument-hint: signed hours (e.g. +2 or -3), then commit count
---

## Context

- Current branch: !`git branch --show-current`
- Recent commits with dates: !`git log --pretty=format:'%h %ci %s' -10`
- Working tree status: !`git status --short`

## Your task

Shift the committer and author dates of the last N commits by a fixed number of hours. Works on both GNU `date` (Debian/Linux) and BSD `date` (macOS) by detecting which is present.

`$1` and `$2` below are slash-command arguments, substituted before the command runs. They are not shell positional variables, so do not wrap them in extra quoting.

Arguments: `$ARGUMENTS`

- `$1` (required): signed hours to shift. Must include the sign: `+1`, `-3`.
- `$2` (required): how many commits back from HEAD to rewrite, e.g. `5`.

If either is missing, ask before proceeding.

## Safety

This rewrites history and changes every affected commit hash. Before running:

- The working tree must be clean. If `git status --short` shows changes, stop and tell the user to commit or stash first.
- Recommend a backup ref so a bad rebase is one command to undo: `git branch backup/$(git branch --show-current) HEAD`. Recover with `git reset --hard backup/<branch>`.
- If these commits were pushed, warn that a force-push (`git push --force-with-lease`) is needed.
- Proceed only after the user confirms.

## Command to execute

`date --version` succeeds only on GNU, so it distinguishes the two utilities. Keeping `%z` in the output preserves the original timezone offset, so dates shift without drifting into the local zone.

```bash
GIT_SEQUENCE_EDITOR=true git rebase -i --exec '
  CURRENT_DATE="$(git show -s --format=%ci HEAD)"
  if date --version >/dev/null 2>&1; then
    NEW_DATE="$(date -d "$CURRENT_DATE $1 hours" +"%Y-%m-%dT%H:%M:%S%z")"
  else
    NEW_DATE="$(date -j -v$1H -f "%Y-%m-%d %H:%M:%S %z" "$CURRENT_DATE" +"%Y-%m-%dT%H:%M:%S%z")"
  fi
  GIT_COMMITTER_DATE="$NEW_DATE" GIT_AUTHOR_DATE="$NEW_DATE" \
    git commit --amend --no-edit --date "$NEW_DATE"
' HEAD~$2
```

`$1` carries its own sign: GNU reads `$CURRENT_DATE +2 hours` / `$CURRENT_DATE -3 hours`, BSD reads `-v+2H` / `-v-3H`. After the rebase, show `git log --pretty=format:'%h %ci %s' -10` to verify the shifted dates.
