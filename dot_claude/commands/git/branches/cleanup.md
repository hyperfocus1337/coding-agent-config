---
allowed-tools: Bash(git fetch:*), Bash(git branch:*), Bash(git for-each-ref:*), Bash(git symbolic-ref:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git merge-base:*), AskUserQuestion
description: Survey local branches whose remote is gone or that are merged into main or master, then delete the branches the user confirms.
disable-model-invocation: true
---

## Your task

Delete two classes of dead local branch, after the user confirms them:

1. **Stale**: the branch tracked a remote branch, and that remote branch is now deleted.
2. **Merged**: the branch never tracked a remote branch, and the default branch (`main` or `master`) contains it.

## Safety

This command deletes local branches. A stale branch is deleted with `git branch -D`, which makes an unmerged commit unreachable.

- The command changes local refs only. Never delete a branch on a remote.
- The command does not delete a worktree. Use `/git:worktrees:cleanup` for a worktree.
- To recover an unreachable commit, use `git reflog` or `git fsck --lost-found`. A branch that never had a remote has no other copy.
- Show the overview first. Delete a branch only after the user confirms it.

## Commands to execute

1. **Prune the stale remote-tracking refs**

   The `[gone]` status is accurate only after this command runs.

   ```bash
   git fetch --prune
   ```

2. **Survey every local branch**

   The survey deletes nothing. Run the block as one command: the classification needs `base` and `current` in the same shell.

   ```bash
   default=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD)
   base=""
   for candidate in "${default#origin/}" main master; do
     [ -n "$candidate" ] || continue
     git rev-parse --verify --quiet "refs/heads/$candidate" >/dev/null && base=$candidate && break
   done
   current=$(git branch --show-current)
   echo "base=${base:-none found} current=${current:-detached HEAD}"

   git for-each-ref --format '%(refname:short)|%(upstream)|%(upstream:track)|%(objectname:short)|%(contents:subject)' refs/heads |
   while IFS='|' read -r branch upstream track sha subject; do
     case "$branch" in
       "$current" | "$base") printf 'KEEP\t%s\tcurrent or default branch\n' "$branch"; continue ;;
     esac
     ahead="?"
     [ -n "$base" ] && ahead=$(git rev-list --count "$base..$branch")
     if [ "$track" = "[gone]" ]; then
       printf 'STALE\t%s\t%s\t%s\t%s\n' "$branch" "$sha" "$ahead" "$subject"
     elif [ -n "$upstream" ]; then
       printf 'KEEP\t%s\tremote branch still exists\n' "$branch"
     elif [ -z "$base" ]; then
       printf 'KEEP\t%s\tno default branch to compare against\n' "$branch"
     elif git merge-base --is-ancestor "$branch" "$base"; then
       printf 'MERGED\t%s\t%s\t0\t%s\n' "$branch" "$sha" "$subject"
     else
       printf 'KEEP\t%s\tnot merged into %s, ahead by %s\n' "$branch" "$base" "$ahead"
     fi
   done
   ```

3. **Show the overview and ask for confirmation**

   If no line is `STALE` or `MERGED`, no cleanup is needed. Do not ask a question. Report the kept branches with the reason for each, then stop.

   For any other result, print one markdown table of the deletion candidates. Use this column order:

   | Branch | Class | Flag | Tip commit | Unmerged commits | Last commit |
   | ------ | ----- | ---- | ---------- | ---------------- | ----------- |

   Above the table, state:

   - The number of candidates in each class.
   - That the command deletes local refs and changes no remote branch.
   - For each stale branch with a nonzero unmerged count: the commits exist only in this clone, and `-D` makes them unreachable.

   Ask one question with `AskUserQuestion`. Give these options: `Delete all`, `Stale only`, `Merged only`, `Cancel`. The user can name a subset through `Other`. Keep every branch that the user does not name.

4. **Delete only the approved branches**

   Take the literal branch names from the approved rows. The deletion then matches the overview exactly. Do not run the survey again to build this list. Run only the command that applies. Omit a command that has no approved branch.

   ```bash
   git branch -D <approved stale branches>
   git branch -d <approved merged branches>
   ```

   If the user chose `Cancel`, delete nothing and report that no branch changed.

## Expected behavior

The survey changes no ref. A separate, later command deletes only the branches that the user named. If the user does not answer, delete nothing.

Use `-D` for a stale branch: the remote branch is gone, so git cannot prove that the commits are merged. Use `-d` for a merged branch. `-d` refuses a branch that git does not consider merged, which checks the survey result a second time.

Report the two classes separately. Include the `Deleted branch X (was <sha>)` line that git prints for each deletion. Then list the kept branches with the reason for each.

The classification enforces these rules:

- Never delete the current branch or the default branch.
- Never delete a branch whose remote branch still exists. The stale class covers a branch whose remote branch was deleted, so an upstream that still exists means the branch is still published. To delete a published branch after it merges, remove the `elif [ -n "$upstream" ]` test, and compare against `origin/$base` as well as `$base`. The merge reached the remote before it reached the local base.
- `git branch -d` and `git branch -D` both fail for a branch that has a worktree. Direct the user to `/git:worktrees:cleanup` for that branch.

Detection limit: `--is-ancestor` finds a true merge and a fast-forward merge. A squash merge builds a new commit. A rebase merge writes new commit hashes. In both cases the commits of the branch are not ancestors of the base, and the test does not find them.

Most hosting services, for example GitHub, delete the remote branch when they merge it. The branch then becomes `[gone]`, and the stale class deletes it. The survey reports a squash-merged branch that never had a remote as `not merged`. To delete that branch, use `-D` after the user decides.
