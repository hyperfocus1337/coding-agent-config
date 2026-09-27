---
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read(~/.claude/commands/git/commit/**)
argument-hint: <conversation|multiple|task [scope]>
description: Plan the commits a commit command would make, without committing
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat`
- Recent commits: !`git log --oneline -5`

## Your task

Plan the commits that a commit command would make. Commit nothing, stage nothing, and do not edit files.

1. **Target.** The first word of `$ARGUMENTS` is the target command: `conversation`, `multiple`, or `task`. For `task`, the rest of `$ARGUMENTS` is its scope. If the first word is empty or not one of these three, print only the block below and stop. Do not ask with AskUserQuestion, and do not pick a target.

   ```
   Give a target:
   - /git:commit:plan conversation: this conversation's changes, as scoped commits
   - /git:commit:plan multiple: every change in the working directory, as several commits
   - /git:commit:plan task [scope]: one task's changes, as one commit
   ```

2. **Rules.** Read `~/.claude/commands/git/commit/<target>.md`. Apply its steps that decide what to commit and how to group it. Stop before its first staging step.

3. **Print.** Use this format, with no other text:

   ```
   Plan for /git:commit:<target>

   1. `<Conventional Commits subject>`
      - <path>
      - <path> (partial)

   Left out:
   - <path>: <one reason, for example "changed before this conversation">
   ```

   Mark a path `(partial)` when only some of its hunks are in the commit. Leave out the "Left out" section when nothing is left out.

The user can change the plan in the next messages. The target command follows the plan with those changes.
