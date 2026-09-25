---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
argument-hint: [scope]
description: Commit one task's changes
---

## Context

- Status: !`git status -sb`
- Diff: !`git diff HEAD`
- Recent commits: !`git log --oneline -5`

## Your task

Commit one task's changes and nothing else. The scope is $ARGUMENTS. If that is empty, the scope is the last task the user asked for in this conversation.

A conversation is not a scope. Out of scope by default:

- a file changed for a different task in the same conversation
- a fix you made on your own initiative that the user did not ask for (unless it's part of the task)
- reformatting a hook applied to a file you only moved or renamed. If a PostToolUse hook re-applies it after every command, you cannot hold the file unformatted: include it and name it in the final line.
- a change that was already in the working directory when the conversation started

"I touched this file" is not a reason to commit it. If you cannot tie a path to the scope, leave it out.

1. **List.** Build the include list: the paths you changed for this scope, each tied to the request that caused it. Keep the list in your reasoning, do not print it.
2. **Stage.** Stage only those paths, naming each one. If a file also carries out-of-scope hunks, stage only the in-scope hunks with `git add -p`. Never `git add -A`, `git add .`, `git add -u`, or `git commit -a`.
3. **Verify.** Compare `git diff --cached --name-only` against the include list. Unstage anything extra with `git restore --staged <path>` and repeat until they match.
4. **Commit.** Use Conventional Commits with a concise subject, body only when the subject does not carry the reason. Describe the scope and nothing else. If the body needs "also", unstage the extra change and return to step 2.

Do not edit files. Print one line as inline code: `<short sha> <subject>`, plus `left: <count> paths` when anything stayed uncommitted. No other text.
