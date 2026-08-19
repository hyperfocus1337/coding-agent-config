---
allowed-tools: Bash(git config:*), Bash(git version:*), Bash(git rev-parse:*), Bash(git worktree:*)
description: Set worktree.useRelativePaths so git worktrees keep working when the repository is opened at a different path, such as in a container and on the host.
disable-model-invocation: true
---

## Your Task

Configure the current repository to store worktree links as relative paths. Git writes absolute paths into `.git/worktrees/<name>/gitdir` and into the worktree's `.git` file by default. The repository checkout is mounted at a different path in a container than on the host, so those absolute paths break on one side. Relative paths work on both.

Requires git 2.48 or later. On older git, report the version and stop.

## Commands to Execute

1. **Check the git version and that this is a repository**

   ```bash
   git version && git rev-parse --show-toplevel
   ```

   If the version is below 2.48, tell the user that `worktree.useRelativePaths` is not supported and stop.

2. **Enable relative worktree paths for this repository**

   ```bash
   git config worktree.useRelativePaths true
   ```

   This writes to `.git/config`:

   ```ini
   [worktree]
       useRelativePaths = true
   ```

   Add `--global` only if the user asks for it on every repository.

3. **Rewrite the links of existing worktrees**

   New worktrees use relative paths from now on. Existing ones keep their absolute paths until they are repaired:

   ```bash
   git worktree repair
   ```

4. **Verify**

   ```bash
   git config --get worktree.useRelativePaths && git worktree list
   ```

## Expected Behavior

After these commands, `worktree.useRelativePaths` is `true`, existing worktree links are relative, and `git worktree list` works from both the container and the host. Report the value that was set and how many worktrees were repaired.
