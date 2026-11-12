---
allowed-tools: Bash(git branch:*), Bash(git worktree:*), Bash(git rev-parse:*)
description: Remove git worktrees whose branch is [gone] on the remote, then delete those branches. For branch-only cleanup use /branches.
disable-model-invocation: true
---

## Your Task

Remove the worktrees of `[gone]` branches (deleted on the remote), then delete those branches. For branches without worktrees, use `/branches` instead.

## Commands to Execute

1. **List branches to identify any with [gone] status**

   ```bash
   git branch -v
   ```

   A `+` prefix marks a branch with a worktree. Remove the worktree before you delete the branch.

2. **Identify worktrees that need to be removed for [gone] branches**

   ```bash
   git worktree list
   ```

3. **Remove worktrees and delete [gone] branches**
   ```bash
   # Process all [gone] branches, removing '+' prefix if present
   git branch -v | grep '\[gone\]' | sed 's/^[+* ]//' | awk '{print $1}' | while read branch; do
     echo "Processing branch: $branch"
     # Find and remove worktree if it exists
     worktree=$(git worktree list | grep "\\[$branch\\]" | awk '{print $1}')
     if [ ! -z "$worktree" ] && [ "$worktree" != "$(git rev-parse --show-toplevel)" ]; then
       echo "  Removing worktree: $worktree"
       git worktree remove --force "$worktree"
     fi
     # Delete the branch
     echo "  Deleting branch: $branch"
     git branch -D "$branch"
   done
   ```

## Expected Behavior

Report which worktrees and branches were removed. If no branches are marked as [gone], report that no cleanup was needed.
