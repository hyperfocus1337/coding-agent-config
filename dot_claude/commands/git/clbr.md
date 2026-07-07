---
allowed-tools: Bash(git fetch:*), Bash(git branch:*), Bash(git for-each-ref:*), Bash(git remote:*)
description: Delete local branches whose remote tracking branch no longer exists (stale local branches).
---

## Your Task

Prune stale local branches: branches that used to track a remote branch which has since been deleted. Do not touch worktrees (use `/clwt` for that).

## Commands to Execute

1. **Prune stale remote-tracking refs so [gone] status is accurate**
   ```bash
   git fetch --prune
   ```

2. **List local branches whose upstream is gone**
   ```bash
   git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads | grep '\[gone\]' | awk '{print $1}'
   ```

3. **Delete each gone branch**
   ```bash
   git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads \
     | grep '\[gone\]' \
     | awk '{print $1}' \
     | while read branch; do
         echo "Deleting stale branch: $branch"
         git branch -D "$branch"
       done
   ```

## Expected Behavior

After running these commands you will:

- Prune stale remote-tracking references
- List local branches whose remote counterpart was deleted
- Delete each of those local branches

Never delete the current branch or a branch with an existing remote. If no branches are `[gone]`, report that no cleanup was needed. Branches with associated worktrees will fail a plain `git branch -D`; for those, direct the user to `/clwt`.