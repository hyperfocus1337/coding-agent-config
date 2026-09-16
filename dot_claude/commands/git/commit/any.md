---
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), SlashCommand, Skill
argument-hint: [scope or hint]
description: Pick the commit command that fits the current changes, then run it
disable-model-invocation: true
---

## Context

- Status, branch, and ahead count: !`git status -sb`
- Change size per file: !`git diff HEAD --stat`
- Recent commits: !`git log --oneline -10`

## Your task

Pick the commit command that fits the changes above, then invoke it. Do not commit anything yourself.

`$ARGUMENTS`, when it is not empty, is a hint about which changes the user means. Use it in step 3, and pass it on in step 6.

### 1. Stop when there is nothing to commit

If the status shows no changed paths, say the working directory is clean and stop.

### 2. Check for a fixup first

Route to `/git:commit:extend` when all three hold:

- The changes touch only paths that the most recent commit already touched.
- They correct or complete that commit: a fix made after it, formatter or lint hook output, or a review change.
- That commit is unpushed. The `ahead` count in the status line is 1 or more.

Otherwise continue to step 3.

### 3. Decide the scope axis

Answer one question: does the working directory hold changes this conversation did not make?

Compare every changed path against what you changed in this conversation. A path is foreign when you cannot tie it to something you did here.

- **Foreign paths exist.** The scope is the conversation. Use `/git:commit:task` or `/git:commit:conversation`. Both print an include list and an exclude list before they stage, and they leave the foreign changes uncommitted.
- **Every changed path is yours.** The scope is the whole working directory. Use `/git:commit:single` or `/git:commit:multiple`. They reach the same result with a shorter process.
- **You have no conversation history**, because the session started at this command. You cannot tie any path to yourself, so the conversation commands would find nothing to include. Use the working directory commands.

### 4. Decide the count axis

Count the distinct logical units in the diff. Group by concern, not by file: feature vs. fix vs. refactor vs. docs vs. test vs. chore. One file can hold two units, and one unit can span several files.

### 5. Route

| Scope                   | One unit             | Two or more units          |
| ----------------------- | -------------------- | -------------------------- |
| Whole working directory | `/git:commit:single` | `/git:commit:multiple`     |
| This conversation       | `/git:commit:task`   | `/git:commit:conversation` |

### 6. Run it

State the pick in one line: the command you chose, and the signal that chose it.

Then invoke that command as a slash command, so it runs its own context blocks against the current tree and follows its own process. Do not copy its steps into this one.

When you route to `/git:commit:task`, pass `$ARGUMENTS` as its scope argument. The other commands take no argument.

Do not stage, commit, or edit anything yourself. Send the one-line pick and nothing else.
