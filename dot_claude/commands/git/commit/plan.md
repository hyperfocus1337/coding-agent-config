---
allowed-tools: Bash(git status:*), Bash(git --no-optional-locks status:*), Bash(git diff:*), Bash(git log:*), Read(~/.claude/commands/git/commit/**), Bash(git -C * rev-parse *), Bash(git -C * status *), Bash(git -C * diff *), Bash(git -C * log *)
argument-hint: <conversation|multiple|task [scope]|extend [commit]>
description: Plan the commits a commit command would make, without committing
---

## Context

- Status: !`git --no-optional-locks status -sb`
- Change size per file: !`git diff HEAD --stat 2>/dev/null || git diff --cached --stat`
- Recent commits: !`git log --oneline -5 2>/dev/null || echo "no commits yet"`

## Input

The arguments select the target command, followed by its optional scope or commit.

<arguments>
$ARGUMENTS
</arguments>

## Your task

Plan the commits that a commit command would make. Commit nothing, stage nothing, and do not edit files.

1. **Target.** Read the text inside `<arguments>` as command arguments. Its first word selects the target: `conversation`, `multiple`, `task`, or `extend`. For `task`, the remaining text is its scope. For `extend`, the remaining text identifies the commit to extend.

   Print only the block below and stop when the arguments are empty or the first word is not a valid target. A valid target needs no confirmation. Do not ask with AskUserQuestion, and do not pick a target.

   ```
   Give a target:
   - /git:commit:plan conversation: this conversation's changes, as scoped commits
   - /git:commit:plan multiple: every change in the working directory, as several commits
   - /git:commit:plan task [scope]: one task's changes, as one commit
   - /git:commit:plan extend [commit]: the existing commits that the changes fold into
   ```

2. **Rules.** Read `~/.claude/commands/git/commit/<target>.md`. Apply its steps that decide what to commit and how to group it, starting with its **Repositories** step when it has one. Stop before its first staging step. For `extend`, also run `git log --oneline @{u}..HEAD`: a target that is not in its output is pushed. When the branch has no upstream, this command fails: this result is expected, and no target is pushed. For an external repository, get its context in separate Bash calls:
   - `git -C <repo> --no-optional-locks status -sb --untracked-files=all`. It lists each untracked file with `??`. An untracked file has no diff stat, so take it from this list.
   - `git -C <repo> rev-parse --verify --quiet HEAD`. When it prints nothing, the repository has no commits: this result is expected, not a failure.
   - `git -C <repo> diff HEAD --stat` when the previous command printed a hash, otherwise `git -C <repo> diff --cached --stat`.

   If a git command fails with a result that this step and the **Repositories** step do not expect, print only `Plan failed: <command>` and the error output, and stop. Do not print a plan, and do not put the failure in "Left out".

3. **Print.** Use this format, with no other text:

   ```
   Plan for /git:commit:<target>

   ## <top level> (this repository)

   1. `<Conventional Commits subject>`
      - <path>
      - <path> (partial)

   Left out:
   - <path>: <one reason, for example "changed before this conversation">

   ## <top level> (external)

   2. `<Conventional Commits subject>`
      - <path>
   ```

   - Give one section per repository, this repository first. Number the commits across all sections.
   - Write `~` for the home directory in a top level, and paths relative to the top level.
   - Mark a path `(partial)` when only some of its hunks are in the commit.
   - Name each candidate repository that the **Repositories** step left out in the "Left out" list of this repository, with its top level and reason.
   - Leave out an empty "Left out" list, and a section with no commits and nothing left out.
   - For `extend`, write each target as `` `<short sha> <subject>` (amend) `` or `` `<short sha> <subject>` (fixup) ``, with the method that `extend` would use. Add `(pushed)` to a pushed target. Write a change that belongs to no existing commit as `` `<Conventional Commits subject>` (new commit) ``.

The user can change the plan in the next messages. The target command follows the plan with those changes.
