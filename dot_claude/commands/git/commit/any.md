---
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), SlashCommand, Skill
argument-hint: [scope or hint]
description: Route to the commit command that fits the changes
disable-model-invocation: true
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat`
- Recent commits: !`git log --oneline -5`

## Your task

Pick the commit command that fits the changes above and invoke it. Commit nothing yourself. `$ARGUMENTS`, when set, is a hint about which changes the user means: use it in step 3 and pass it on in step 5.

1. **Nothing to commit.** No changed paths: say the tree is clean and stop.
2. **Fixup.** Route to `/git:commit:extend` when all three hold: the changes touch only paths the most recent commit touched, they correct or complete that commit, and that commit is unpushed (`ahead` is 1 or more).
3. **Scope.** Does the tree hold changes this conversation did not make? A path you cannot tie to something you did here is foreign.
   - Foreign paths exist: the scope is the conversation, so use `/git:commit:task` or `/git:commit:conversation`. They leave foreign changes uncommitted.
   - Every path is yours: the scope is the whole tree, so use `/git:commit:single` or `/git:commit:multiple`.
   - No conversation history, because the session started at this command: you can tie no path to yourself, so use the working directory commands.
4. **Count.** Count the distinct logical units in the diff. Group by concern, not by file.

   | Scope        | One unit             | Two or more                |
   | ------------ | -------------------- | -------------------------- |
   | Whole tree   | `/git:commit:single` | `/git:commit:multiple`     |
   | Conversation | `/git:commit:task`   | `/git:commit:conversation` |

5. **Run it.** Invoke the pick as a slash command so it runs its own context blocks and its own process. Do not copy its steps here. Pass `$ARGUMENTS` to `/git:commit:task`; the others take no argument.

Print one line: the command you picked and the signal that picked it. Nothing else.
