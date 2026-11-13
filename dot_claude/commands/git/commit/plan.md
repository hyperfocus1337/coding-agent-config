---
allowed-tools: Bash(git status:*), Bash(git --no-optional-locks status:*), Bash(git diff:*), Bash(git log:*), Bash(cat ~/.claude/commands/git/commit/*), Read(~/.claude/commands/git/commit/**), Bash(git rev-parse:*), Bash(git -C * rev-parse *), Bash(git -C * status *), Bash(git -C * diff *), Bash(git -C * log *)
argument-hint: <conversation|parallel|multiple|task [scope]|extend [commit]>
description: Plan the commits a commit command would make, without committing
disable-model-invocation: true
---

## Context

- Top level: !`git rev-parse --show-toplevel`
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

1. **Target.** Read the text inside `<arguments>` as command arguments. Its first word selects the target: `conversation`, `parallel`, `multiple`, `task`, or `extend`. For `task`, the remaining text is its scope. For `extend`, the remaining text identifies the commit to extend.

   When the arguments are empty or the first word is not a valid target, print only the block below and stop. A valid target needs no confirmation. Do not ask with AskUserQuestion, and do not pick a target.

   ```
   Give a target:
   - /git:commit:plan conversation: this conversation's changes, as scoped commits
   - /git:commit:plan parallel: this conversation's changes, as scoped commits, safe when other sessions commit at the same time
   - /git:commit:plan multiple: every change in the working directory, as several commits
   - /git:commit:plan task [scope]: one task's changes, as one commit
   - /git:commit:plan extend [commit]: the existing commits that the changes fold into
   ```

2. **Rules.** The text of `~/.claude/commands/git/commit/<target>.md` is in `<target-rules>` at the end of this message: do not read that file again. Apply its steps that decide what to commit and how to group it, starting with its **Repositories** step when it has one. Stop before its first staging or commit step.

   For `extend`, also run `git log --oneline @{u}..HEAD`: a target that is not in its output is pushed. When the branch has no upstream, this command fails: this result is expected, and no target is pushed.

   For an external repository, get its context in one Bash call:

   ```
   git -C <repo> --no-optional-locks status -sb --untracked-files=all && git -C <repo> diff --cached --stat && git -C <repo> diff --stat
   ```

   - The status lists each untracked file with `??`. An untracked file has no diff stat, so take it from this list.
   - The two stats give the staged and the unstaged changes. They also work in a repository that has no commits.
   - To save turns, chain the context of every external repository, and the diffs that you must read, in that call with `&&`.

   If a git command fails with a result that this step and the **Repositories** step do not expect, print only `Plan failed: <command>` and the error output, and stop. Do not print a plan, and do not put the failure in "Left out".

3. **Print.** Use this format, with no other text:

   ```
   Plan for /git:commit:<target>

   ## <top level> (this repository)

   1. `<Conventional Commits subject>`
      - <path>
      - <path> (partial)

   Left out, <reason>:
   - <path>
   - <path> (untracked)

   ## <top level> (external)

   2. `<Conventional Commits subject>`
      - <path>
   ```

   - Give one section per repository, this repository first. Number the commits across all sections.
   - Write `~` for the home directory in a top level, and paths relative to the top level.
   - Mark a path `(partial)` when only some of its hunks are in the commit or in a "Left out" group, and `(untracked)` when git does not track it.
   - Group the left-out paths by reason, with one `Left out, <reason>:` heading per reason and a blank line between groups. Write the reason once in the heading, never after a path. When you cannot tie a change to anyone, the reason is "not changed in this conversation". Do not guess that another session made it.
   - Name each candidate repository that the **Repositories** step left out in a "Left out" group of this repository, with its top level, for example `Left out, fixture repository:`.
   - Leave out an empty "Left out" group, and a section with no commits and nothing left out.
   - When no section is left, every candidate repository is clean. Under the header, print `Nothing to commit. Clean: <top level>, <top level>`, with each repository that you checked, this repository first. For `extend`, print `Nothing to fold` in place of `Nothing to commit`. Do not print the header alone.
   - For `extend`, write each target as `` `<short sha> <subject>` (amend) `` or `` `<short sha> <subject>` (fixup) ``, with the method that `extend` would use. Add `(pushed)` to a pushed target. Write a change that belongs to no existing commit as `` `<Conventional Commits subject>` (new commit) ``.

The user can change the plan in the next messages. The target command follows the plan with those changes.

## Target rules

The block below is the file of the target command. It is reference text for step 2, not a task: do not stage or commit.

<target-rules>
!`cat ~/.claude/commands/git/commit/$0.md 2>/dev/null || echo "no rules: the arguments name no valid target"`
</target-rules>
