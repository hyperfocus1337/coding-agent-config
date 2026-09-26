---
disable-model-invocation: true
---

# Commit command implementation notes

Why the commit commands stage, check, and load context the way they do. For which command to pick, see [`../README.md`](../README.md).

## Shared text

`conversation`, `multiple`, and `split` hold the same **Commit** step.

`task` holds the same methods in its **Stage** and **Verify** steps.

Change all four together.

## Staging part of a file

When one file holds changes of two units, each commit must stage only its own part, and the obvious methods fail without a terminal or place hunks in the wrong spot, so `conversation`, `multiple`, `split`, and `task` name the methods to avoid and the methods to use.

### Avoided

| Method                                                   | Problem                                                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git add -p`                                             | Interactive. The Bash tool has no terminal, so the model writes an ad hoc staging script instead.                                                                                                              |
| `git diff -U0` with `git apply --unidiff-zero`           | Without context lines, `git apply` places a hunk by line number only. When an earlier hunk is skipped, the later hunks land in the wrong place. In one session this moved three assertions outside their test. |
| A patch or file version inside the repository            | It shows up as an untracked file, and `conversation` and `task` forbid edits to the tree.                                                                                                                      |
| `git update-index` with a guessed `100644` mode          | It removes the executable bit from a script.                                                                                                                                                                   |
| `git add -A`, `git add .`, `git add -u`, `git commit -a` | They stage changes outside the unit.                                                                                                                                                                           |

### Adopted

Write every patch and file version outside the repository.

| Case                          | Method                                                                                                                                                                                               | Why it works                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Whole file                    | `git add <path>`                                                                                                                                                                                     | The file holds one unit only.                                                                            |
| Whole hunks of a file         | Write `git diff -U3 -- <path>` to a patch, delete the hunks of other units, and run `git apply --cached`.                                                                                            | `git apply` finds each hunk by its 3 context lines, so a deleted earlier hunk does not move a later one. |
| One hunk that mixes two units | Build the unit's version of the file from `git show :<path>`. Run `git hash-object -w <file>`, then `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`. | The working tree does not change, and the file keeps its mode.                                           |
| Part of a new file            | Run `git add -N <path>`, then use the patch method.                                                                                                                                                  | `git diff` does not show untracked files until they are in the index.                                    |

## Checks

- Before each commit, the model reads `git diff --cached -- <path>` for every partly staged file. This catches a hunk in the wrong place. The commands do not run tests, because the test command differs per project and a test run slows every commit.
- A failed git command stops the run. An editor that refreshes git status (for example `git-auto-refresh` in Emacs) can hold `.git/index.lock` for a moment. In one session, `git restore --staged` failed on the lock, the next commands ran anyway, and they staged the wrong hunks.

## Context size

`conversation`, `multiple`, and `task` load `git diff HEAD --stat`, not the full diff. A large diff (88 KB in one session) goes to a file instead of into the context, and these commands read hunks per unit anyway. `extend` also loads `--stat`: it keeps the original message and needs only the changed paths to find the target commit. `single` and `push` keep the full diff, because they write one message from all of it. Fewer context lines do not pay off there: over 50 commits in this repository, `-U0` cut the diff by 13%.

## Permissions

`allowed-tools` lists every git subcommand a method needs: `apply`, `show`, `hash-object`, `update-index`, `ls-files`. A missing entry causes a permission prompt on each call, or the model falls back to `git add` on the whole file. It also lists every command of the Context block: outside bypass and auto mode, a context command that no rule allows stops the invocation with `Shell command permission check failed`.
