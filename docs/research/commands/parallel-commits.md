# Parallel commits: two sessions, one branch

Which git method lets two or more Claude Code sessions commit on the same branch in one checkout without committing the work of each other. The result is [`/git:commit:parallel`](../../../dot_claude/commands/git/commit/parallel.md). For the method as built and its limits, see [parallel sessions](../../../dot_claude/commands/git/commit/README.md#parallel-sessions).

Tested on 2026-10-02 with git 2.55.0 in scratch repositories that simulate two sessions. Permission rule matching comes from the [Claude Code permissions page](https://code.claude.com/docs/en/permissions) on the same date.

## Problem

[`/git:commit:conversation`](../../../dot_claude/commands/git/commit/conversation.md) stages each unit in `.git/index` and then runs `git commit`. Sessions in one checkout share three things: the working tree, `.git/index`, and `HEAD`. This causes three failures:

- **Shared stage.** `git commit` takes the whole index. When session A commits, it also takes the hunks that session B staged a moment earlier.
- **Lock contention.** Two sessions that write the index at the same moment get `Unable to create '.git/index.lock': File exists`.
- **Lost commit.** If both sessions read `HEAD`, build a commit, and move the branch, the second move can discard the first commit or revert its changes.

A worktree per session removes all three failures, but it is out of scope: the sessions must work on one branch and see each other's edits.

## Requirements

A correct method must do three things:

1. Build the commit somewhere other than the shared index.
2. Move the branch only if `HEAD` did not change since the session read it.
3. After the commit, update the shared index for the committed paths, so other sessions do not see stale entries.

## Options

| #   | Method                                                                                                                 | Shared index         | Safe on simultaneous commits         | Hooks run | Hunk-level      | Main risk                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------ | --------- | --------------- | -------------------------------------------------------------------------------------------------- |
| A   | Current method: `git add` or `git apply --cached`, then `git commit`                                                   | Writes it            | No                                   | Yes       | Yes             | Commits the staged hunks of the other session. Fails on `index.lock`.                              |
| B   | `git commit --only <paths>`                                                                                            | Writes it for paths  | Partly                               | Yes       | No, whole files | Takes the hunks of the other session in a file that both sessions changed.                         |
| C   | `git stash` the other hunks, commit, `git stash pop`                                                                   | Writes it            | No                                   | Yes       | Yes             | Rewrites files while the other session edits them. Changes can be lost.                            |
| D   | Lock directory (`mkdir .git/commit.lock`) around method A                                                              | Writes it            | Yes, while all sessions use the lock | Yes       | Yes             | A stale lock stays when a session stops. Staging outside the command still leaks.                  |
| E   | Private index with `git commit`: `GIT_INDEX_FILE=<file> git read-tree HEAD`, `git apply --cached`, `git commit`        | Does not write it    | Partly                               | Yes       | Yes             | A commit of the other session between `read-tree` and `commit` is silently reverted.               |
| F   | Private index with plumbing: `read-tree <base>`, `apply --cached`, `write-tree`, `commit-tree -p <base>`, `update-ref` | Does not write it    | Yes                                  | No        | Yes             | No `pre-commit` or `commit-msg` hook. On a failed `update-ref`, the session builds the unit again. |
| G   | One worktree and branch per session, then cherry-pick                                                                  | Each session has one | Yes                                  | Yes       | Yes             | Not one branch, and sessions do not see each other's edits.                                        |

Only F meets all three requirements. E is the second choice if hooks are necessary, but it needs a check after each commit that the commit holds only the paths of the session.

### Why E is not enough

`git commit` takes a lock on `HEAD` and checks that `HEAD` still has the value it read when the commit started. It does not check the value from the moment the session ran `read-tree`. Thus this sequence passes the check:

1. Session A runs `read-tree HEAD` at commit H1 and adds its hunks.
2. Session B commits H2.
3. Session A runs `git commit`. Git reads H2 as the parent and writes the tree of A, which is H1 plus the hunks of A.

The commit of A has H2 as parent but no changes of H2, so it reverts session B.

F closes this interval: every patch, every file version, `read-tree`, `commit-tree -p`, and `update-ref` use the same literal `<base>`.

## Tests

Each test ran in a new scratch repository. Session B edited line 10 of a file `f` and staged a change to `s.sh` in the shared index. Session A edited line 1 of `f` and appended to `g`, then committed with method F.

| Test                                                         | Result                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `git read-tree <base>` into an empty `mktemp` file           | Works. An empty file is a valid start for a private index.                                                                    |
| Commit of A from the private index                           | Holds `g` and only line 1 of `f`.                                                                                             |
| Shared index after the commit, before the refresh            | `git diff --cached` shows `f`, `g`, and `s.sh`: the committed hunks appear as staged reversals.                               |
| `git reset -q -- f g`                                        | The shared index shows only `s.sh` staged, which is the stage of B. The line 10 hunk of B stays unstaged in the working tree. |
| Reflog after `git update-ref -m "commit: ..." HEAD ...`      | One entry on `HEAD` and one on `main`, as `git commit` writes.                                                                |
| `git update-ref HEAD <commit> <stale base>`                  | Fails with `cannot lock ref 'HEAD': is at <sha> but expected <base>`. The branch does not move.                               |
| `commit.gpgSign=true` with `gpg.program=false`               | `git commit-tree` succeeds, so it ignores `commit.gpgSign`. A signed commit needs `-S`.                                       |
| Executable file added with `git add` to the private index    | Keeps mode `100755`.                                                                                                          |
| Part of a new file with `git update-index --add --cacheinfo` | The commit holds only the part of A. After the refresh, the rest of the file shows as an unstaged change.                     |

## Permission rules

The command runs commands such as `GIT_INDEX_FILE=<dir>/index git apply --cached <patch>`. The permissions page says:

> Claude Code also strips a leading assignment of certain known-safe environment variables, so `Bash(npm test *)` matches `NODE_ENV=test npm test`. An allow rule won't match past an assignment of any other variable.

The page does not list the known-safe variables. It shows `*` at the start, in the middle, and at the end of a rule, but no rule that starts with a variable assignment. The page also says that a rule must match each subcommand of `&&`, `||`, `;`, and `|` separately. It does not say how `export` and `$(...)` are matched.

For this reason, the command:

- Names the assignment in each rule, for example `Bash(GIT_INDEX_FILE=* git apply *)`.
- Runs each git command as a separate call with literal SHAs. It uses no shell variables, no `export`, and no `$(...)`.

This is not tested outside bypass mode. If a rule does not match, the result is a permission prompt, not a wrong commit.

## Open questions

- Do the `GIT_INDEX_FILE=* git <subcommand> *` rules match in default permission mode?
- Is a hook gap a problem in repositories with a `commit-msg` hook, for example commitlint? Method E with a check after the commit keeps the hooks.
- How often does `update-ref` fail in real use? Each failure costs one rebuild of the unit.
