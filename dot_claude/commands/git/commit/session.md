---
allowed-tools: Bash(git add:*), Bash(git reset:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
argument-hint: [scope]
description: Commit one task's changes from the current conversation
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Commit one task's changes and nothing else.

The scope is $ARGUMENTS. If that is empty, the scope is the last task the user asked you to do in this conversation.

A conversation is not a scope. One conversation holds several unrelated tasks, fixes you decided to make on the side, edits a formatter or lint hook wrote, and changes that were already in the working directory before it started. All of those are out of scope. "I touched this file" is not a reason to commit it.

Follow this process:

1. State the scope in one sentence, from $ARGUMENTS or from the last request in the conversation.

2. Build an include list of the paths you changed for that scope. For each path, name the request that made you change it. A path you cannot tie to a request is out of scope. Out of scope by default:
   - a file changed for a different task in the same conversation
   - a fix you made on your own initiative that the user did not ask for
   - reformatting that a hook or formatter applied to a file you only moved or renamed. Check first whether a PostToolUse hook re-applies it after every command. If it does, you cannot hold the file unformatted long enough to stage around it: include the reformatting and name it in the step 7 report instead of fighting the hook.
   - a change that was already in the working directory when the conversation started

3. Print the include list and the exclude list before you stage anything. One path per line with a one-line reason.

4. Stage only the include list, naming every path explicitly. If an included file also carries out-of-scope hunks, stage only the in-scope hunks with `git add -p`. Never use `git add -A`, `git add .`, `git add -u`, or `git commit -a`.

5. Run `git diff --cached --name-only` and compare it against the include list. If they differ, `git reset` the extra paths and repeat this step until they match.

6. Commit. Use the Conventional Commits format with a concise subject line. Add a body only when the reason for the change is not obvious from the subject. Describe the scope and nothing else. If the body needs the word "also", the extra change belongs in its own commit: unstage it and return to step 4.

7. Run `git status` and report the paths that stayed uncommitted.

If you cannot decide whether a path is in scope, leave it out and say so.

Do not edit files. Use the git tools plus the two lists from step 3 and the report from step 7. Send no other text.
