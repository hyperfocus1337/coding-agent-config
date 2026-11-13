---
allowed-tools: Bash(git add:*), Bash(git restore --staged:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git apply:*), Bash(git hash-object:*), Bash(git update-index:*), Bash(git ls-files:*), Bash(python3 */.claude/commands/git/commit/scripts/stage/stage-replace.py *), Bash(git reset --soft:*), Bash(git rev-parse:*), Bash(git rev-list:*)
argument-hint: <why the split is needed>
description: Split the previous commit into separate commits
disable-model-invocation: true
---

## Context

- Status: !`git status -sb`
- Previous commit: !`git show --stat HEAD`
- Unpushed: !`git rev-list --count @{upstream}..HEAD 2>/dev/null || echo "no upstream"`

## Input

The arguments explain why the previous commit needs to be split.

<arguments>
$ARGUMENTS
</arguments>

## Your task

Split `HEAD` into one commit per logical unit. Use the text inside `<arguments>` to find the changes that do not belong together.

1. **Check.** Stop if the tree is not clean, or if `HEAD` is pushed and the user has not confirmed a force-push. Stop if the arguments are empty and ask why the split is needed.
2. **Undo.** Record the `HEAD` SHA as `<original sha>`. Then run `git reset --soft HEAD~1`, then `git restore --staged .` so every change of the commit is unstaged.
3. **Group.** Group by concern, not by file. One file can hold two units. Order foundational changes first.
4. **Commit.** Per unit:
   1. Stage the unit. Never `git add -A`, `git add .`, `git add -u`, `git commit -a`, or `git apply --unidiff-zero`.
      - A whole file: `git add <path>`.
      - Part of a file: write `git diff -U3 -- <path>` to a patch outside the repository, copy this unit's hunks, picked by their text, to a new, unused patch file, and run `git apply --cached <new patch>`.
      - One hunk that mixes two units: write this unit's version of the file to a file outside the repository, starting from `git show :<path>`. Then run `git hash-object -w <file>` and `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`.
      - Shortcut for part of a file, when this unit's change in that file is at most 3 text replacements: `python3 "$HOME/.claude/commands/git/commit/scripts/stage/stage-replace.py" <path> '<old text>' '<new text>'`, with one more pair per replacement. It applies each replacement to the staged version of the file and stages the result, so no patch and no file version is needed. It stops with an error when an old text does not occur exactly once in the staged version.
      - For a partial method, read the diff of the file once, with `git ls-files -s <path>` in the same Bash call. Then one Bash call holds the whole method and the check of step 4.2, chained with `&&`: write the patch or the file version, write the index, and print the check.
   2. Check the stage. For a unit of whole files, stage and check in one Bash call. Compare `git diff --cached --name-only` against the unit and unstage anything extra with `git restore --staged <path>`. For each partly staged file, read `git diff --cached -- <path>` and confirm every hunk is in this unit and sits where it belongs.
   3. In a new Bash call, after you read the check, commit with Conventional Commits. Reuse the original subject for the unit it describes. To save a turn, continue that call with `&&`: stage and check the next unit, or after the last unit run the status of step 5. A call holds at most one `git commit`, as its first command.
5. **Repeat.** Continue until `git status` is clean and `git diff <original sha>` is empty.

## Rules

If a git command fails, stop and report the error.

## Output

Print one line per commit as inline code: `<short sha> <subject>`. No other text.
