---
allowed-tools: Bash(git push:*), Bash(git remote:*), Bash(git branch:*), Bash(git status:*), AskUserQuestion
description: Push the current branch to origin, and ask about any other remote
---

## Context

- Current branch: !`git branch --show-current`
- Remotes: !`git remote -v`
- Branch status: !`git status -sb | head -1`

## Your task

Push the current branch.

1. Push to `origin`. Add `-u` if the branch has no upstream.

   ```bash
   git push origin HEAD
   ```

2. Look at the remotes above. If `origin` is the only one, stop and report the result.

3. If another remote with a push URL exists, ask the user with `AskUserQuestion` whether to push there too. List each other remote as an option, plus `Origin only`. Use `multiSelect: true` when there is more than one.

4. Push to each remote the user selects, one command per remote. Report the result per remote.

Do not commit, stage, amend, or force-push. If the push is rejected because the remote is ahead, report the rejection and stop. Do not pull, rebase, or force.
