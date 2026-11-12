---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git apply:*), Bash(git show:*), Bash(git hash-object:*), Bash(git update-index:*), Bash(git ls-files:*), Bash(git status:*), Bash(git --no-optional-locks status:*), Bash(sleep 10), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Bash(git -C * rev-parse *), Bash(git -C * add *), Bash(git -C * restore --staged *), Bash(git -C * apply *), Bash(git -C * show *), Bash(git -C * hash-object *), Bash(git -C * update-index *), Bash(git -C * ls-files *), Bash(git -C * status *), Bash(git -C * commit *), Bash(git -C * diff *), Bash(git -C * log *)
argument-hint: [scope]
description: Commit one task's changes
---

## Context

- Status: !`git --no-optional-locks status -sb`
- Change size per file: !`git diff HEAD --stat 2>/dev/null || git diff --cached --stat`
- Recent commits: !`git log --oneline -5 2>/dev/null || echo "no commits yet"`

## Input

The arguments optionally define the task scope.

<arguments>
$ARGUMENTS
</arguments>

## Your task

Commit one task's changes and nothing else. The text inside `<arguments>` gives the scope. If the arguments are empty, the scope is the last task the user asked for in this conversation.

A conversation is not a scope. Out of scope by default:

- a file changed for a different task in the same conversation
- a fix you made on your own initiative that the user did not ask for (unless it's part of the task)
- reformatting a hook applied to a file you only moved or renamed. If a PostToolUse hook re-applies it after every command, you cannot hold the file unformatted: include it and name it in the final line.
- a change that was already in the working directory when the conversation started

"I touched this file" is not a reason to commit it. If you cannot tie a path to the scope, leave it out.

If `/git:commit:plan` made a plan for this command in this conversation, use its include list and subject, with every change the user asked for since. Still run each step below to check it.

1. **Repositories.** Run `git -C <dir> rev-parse --show-toplevel` for `.` and for the nearest existing directory of each file you edited.
   - Each top level other than the one for `.` is a candidate.
   - `not a git repository` is an expected result, not a failure: the file is in no repository and stays out.
   - A candidate is an external repository. Leave out a candidate that is a disposable fixture, such as a test or pilot repository made to try something, or that holds only generated output, unless the user asks for it.
   - Run the next steps in this repository first, then in each external repository, with `-C <repo>` after `git` in every git command.
   - Make one commit in each repository that holds paths in scope.
2. **List.** Build the include list: the paths you changed for this scope, each tied to the request that caused it. Keep the list in your reasoning, do not print it.
3. **Stage.** Stage only those paths, naming each one. Never `git add -A`, `git add .`, `git add -u`, `git commit -a`, or `git apply --unidiff-zero`.
   - A whole file: `git add <path>`.
   - Part of a file: write `git diff -U3 -- <path>` to a patch outside the repository, copy the in-scope hunks, picked by their text, to a new, unused patch file, and run `git apply --cached <new patch>`.
   - One hunk that mixes in-scope and out-of-scope changes: write the in-scope version of the file to a file outside the repository, starting from `git show :<path>`. Then run `git hash-object -w <file>` and `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`.
4. **Verify.** Compare `git diff --cached --name-only` against the include list. Unstage anything extra with `git restore --staged <path>` and repeat until they match. Read `git diff --cached -- <path>` for each partly staged file to confirm every hunk is in scope and sits where it belongs.
5. **Commit.** In a new Bash call, after you read the output of step 4, use Conventional Commits with a concise subject, body only when the subject does not carry the reason. Describe the scope and nothing else. If the body needs "also", unstage the extra change and return to step 3.

## Rules

- Run each git command in its own Bash call, or chain commands with `&&`, so that a failure stops the commands after it.
- If a git command fails, stop and report the error.
- The one exception is a staging command that fails with `Unable to create '<lock>': File exists`: another process holds the index lock.
  - Run `sleep 10 && git diff --cached --name-only`.
  - If the stage holds only your changes, run the failed command once more.
  - Never touch the lock file, and never run `git commit` twice.
- Do not edit files.

## Output

- Print one line per commit as inline code: `<short sha> <subject>`.
- When anything stayed uncommitted, add `left: <count> paths`.
- When you commit in more than one repository:
  - Print each top level on its own line before its commit lines, this repository first, with `~` for the home directory.
  - Put `left: <count> paths` under the repository that holds those paths.
- When you changed a path in scope that is in no git repository, or in a candidate that step 1 left out, list it after the other lines:
  - Print `Left out, <reason>:` and one path per line under it, with `~` for the home directory.
  - The reason is `not in a git repository` or `fixture repository <top level>`.
- When you make no commit:
  - If every repository that you checked is clean, print `Nothing to commit. Clean: <top level>, <top level>`, this repository first.
  - Otherwise print `Nothing to commit for this scope`, then the top level and `left:` lines as above.
- Put a blank line before each top level after the first, each `left:` line, and each left-out group.
- Print no other text.
