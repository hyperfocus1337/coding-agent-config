---
allowed-tools: Bash(git rebase:*), Bash(git log:*), Bash(git branch:*), Bash(git status:*)
description: Rewrite the author of the whole branch (or the last N commits) via rebase.
argument-hint: author-string (quoted), then optional commit count
arguments: [author, count]
disable-model-invocation: true
---

## Context

- Current branch: !`git branch --show-current`
- Recent commits with authors: !`git log --pretty=format:'%h %an <%ae> %s' -10`
- Working tree status: !`git status --short`

## Your task

Rewrite commit authorship on the current branch to a new author.

`$author` and `$count` below are slash-command arguments, declared in the `arguments:` frontmatter and substituted before the command runs. They are not shell variables.

Arguments: `$ARGUMENTS`

- `$author` (required): new author, formatted `"Firstname Lastname <firstname.lastname@company.com>"`.
- `$count` (optional): number of commits back from HEAD to rewrite. Omit to rewrite the entire branch from the root.

You can pass these positionally, describe them in plain language, or run the command bare. If the author is missing, ask for it. If no count was given and it is not clear the user wants the whole branch, confirm the scope (entire branch vs last N) before running.

An argument you do not pass expands to nothing, so `HEAD~\$count` becomes `HEAD~`, which git reads as `HEAD~1`. When the count is empty, run the entire-branch command. Never run a `HEAD~` with no number.

## Safety

This rewrites history and changes every affected commit hash. Before running:

- The working tree must be clean. If `git status --short` shows changes, stop and tell the user to commit or stash first.
- Recommend a backup ref so a bad rebase is one command to undo: `git branch backup/$(git branch --show-current) HEAD`. Recover with `git reset --hard backup/<branch>`.
- Warn the user: if these commits were already pushed, they will diverge from the remote and require a force-push (`git push --force-with-lease`). Anyone else who has the branch must reset.
- Proceed only after the user confirms.

## Commands to execute

`GIT_SEQUENCE_EDITOR=true` keeps the rebase non-interactive (no editor opens).

Entire branch (no `$count` given):

```bash
GIT_SEQUENCE_EDITOR=true git rebase --root \
  --exec 'git commit --amend --author="$author" --no-edit'
```

Last N commits (`$count` given):

```bash
GIT_SEQUENCE_EDITOR=true git rebase -i HEAD~$count \
  --exec 'git commit --amend --author="$author" --no-edit'
```

Both values are already substituted in the commands above, so run them as written. After the rebase completes, run `git log --pretty=format:'%h %an <%ae> %s' -10` so the user can verify the new author.
