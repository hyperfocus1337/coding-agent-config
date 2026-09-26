---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git apply:*), Bash(git show:*), Bash(git hash-object:*), Bash(git update-index:*), Bash(git ls-files:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
argument-hint: [scope]
description: Commit one task's changes
---

## Context

- Status: !`git status -sb`
- Change size per file: !`git diff HEAD --stat`
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
2. **Stage.** Stage only those paths, naming each one. Never `git add -A`, `git add .`, `git add -u`, or `git commit -a`.
   - A whole file: `git add <path>`.
   - Part of a file: write `git diff -U3 -- <path>` to a patch outside the repository, keep only the in-scope hunks, and run `git apply --cached <patch>`.
   - One hunk that mixes in-scope and out-of-scope changes: write the in-scope version of the file to a file outside the repository, starting from `git show :<path>`. Then run `git hash-object -w <file>` and `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`.
3. **Verify.** Compare `git diff --cached --name-only` against the include list. Unstage anything extra with `git restore --staged <path>` and repeat until they match. Read `git diff --cached -- <path>` for each partly staged file to confirm every hunk sits where it belongs.
4. **Commit.** Use Conventional Commits with a concise subject, body only when the subject does not carry the reason. Describe the scope and nothing else. If the body needs "also", unstage the extra change and return to step 2.

If a git command fails, stop and report the error. Do not run the next step.

Do not edit files. Print one line as inline code: `<short sha> <subject>`, plus `left: <count> paths` when anything stayed uncommitted. No other text.
