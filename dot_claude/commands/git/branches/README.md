---
disable-model-invocation: true
---

# branches:cleanup

What `/git:branches:cleanup` deletes and what it leaves alone. The command classifies every local branch, prints one verdict line per branch, and deletes nothing until you confirm an overview. It only ever removes local refs. It never deletes a branch on a remote, and it never touches worktrees. Use `/git:worktrees:cleanup` for those.

Run order: `git fetch --prune` first, so `[gone]` status is accurate, then a read-only survey, then the prompt, then deletion of the approved branches only.

## Confirmation

The survey and the deletion are separate commands, and the survey deletes nothing. Between them you get a table of the candidates:

| Branch | Class | Flag | Tip commit | Unmerged commits | Last commit |
| ------ | ----- | ---- | ---------- | ---------------- | ----------- |

`Unmerged commits` is `git rev-list --count <base>..<branch>`, so it is always 0 for the merged class. A nonzero count on a stale branch is the number of commits that exist only in this clone. `-D` makes them unreachable, and `git reflog` or `git fsck --lost-found` is the only way back.

The prompt offers `Delete all`, `Stale only`, `Merged only`, and `Cancel`. Naming a subset through "Other" works, and any branch not named is kept. With no candidates, no question is asked: the command reports that nothing needs cleanup and stops.

Deletion then runs on the literal branch names from the approved rows, not on a second survey pass. A branch created, merged, or checked out between the overview and the answer cannot change what gets deleted.

## What it deletes

| Class  | Test                                                   | Flag | Why that flag                                                                  |
| ------ | ------------------------------------------------------ | ---- | ------------------------------------------------------------------------------ |
| Stale  | `%(upstream:track)` is `[gone]`                        | `-D` | The remote counterpart is deleted, so git cannot prove the commits are merged. |
| Merged | No upstream, and the branch is an ancestor of the base | `-d` | `-d` refuses anything git does not consider merged, so it is a second check.   |

The two classes do not overlap. Stale covers branches that had a remote. Merged covers branches that never had one.

## What it keeps

| Branch                        | Reason                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------- |
| The current branch            | Git refuses to delete a checked-out branch.                                       |
| The default branch            | `main` or `master`, whichever the base resolves to.                               |
| Any branch with an upstream   | The remote branch still exists, so the branch is still published.                 |
| A branch not merged into base | Its commits exist nowhere else.                                                   |
| Every branch, if no base      | With no local `main` or `master`, "merged" has no meaning. Reported, not deleted. |
| A branch with a worktree      | `git branch -d` and `-D` both fail. Use `/git:worktrees:cleanup`.                 |

A branch that is merged but still published is kept on purpose. The stale class already handles branches whose remote was deleted, so a live upstream means the branch is still on the remote.

## How the base is resolved

1. `git symbolic-ref refs/remotes/origin/HEAD`, with the `origin/` prefix stripped.
2. Local `main`.
3. Local `master`.

Each candidate must exist as a local ref (`refs/heads/<name>`), so a repo whose `origin/HEAD` points at a branch it never checked out falls through to the next candidate. If no candidate exists, the merged class is skipped and every branch is reported as kept.

The base is always the local ref, never `origin/<base>`. Merged candidates have no upstream, so they exist only in this clone, so any merge of them happened here, into the local base. A local base that is behind its remote cannot hide them.

## Detection limit: squash and rebase merges

The merged test is `git merge-base --is-ancestor`, which finds true merges and fast-forwards. A squash merge builds a new commit and a rebase merge rewrites SHAs, so in neither case do the branch's commits remain ancestors of the base. Neither is detected, and no choice of comparison tip changes that.

This costs little in practice. Most hosting services, for example GitHub, delete the remote branch when they merge it. The local branch then becomes `[gone]`, so the stale class deletes it. Only a squash-merged branch that never had a remote is missed. It is reported as "not merged into `<base>`", and removing it needs `-D` and a human decision.

## Including published branches

To also delete branches that are merged but still on the remote, edit the classification block in `cleanup.md`: remove the `elif [ -n "$upstream" ]` arm, and compare against `origin/$base` as well as `$base`. The remote tip is needed in that case, because the merge that consumed a published branch landed on the remote first. Deleting these is recoverable, since the commits stay on the remote.
