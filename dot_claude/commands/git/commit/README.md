---
disable-model-invocation: true
---

# Commit command implementation notes

Why the commit commands stage, check, and load context the way they do. For which command to pick, see [`../README.md`](../README.md).

## Shared text

`conversation`, `multiple`, and `split` hold the same **Commit** step.

`task` holds the same methods in its **Stage** and **Verify** steps.

Change all four together.

`parallel` holds the same **Lists** and **Group** steps as `conversation`. Its **Commit** step uses the same three methods, but against a private index and `<base>` instead of the shared index. Change it when you change those steps or methods.

`plan` holds no copy of these steps: it reads the target command file at run time. `conversation`, `multiple`, `task`, and `any` hold the same sentence that makes them follow a plan from `plan`.

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

| Case                          | Method                                                                                                                                                                                               | Why it works                                                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whole file                    | `git add <path>`                                                                                                                                                                                     | The file holds one unit only.                                                                                                                                                                                                                  |
| Whole hunks of a file         | Write `git diff -U3 -- <path>` to a patch, copy the hunks of the unit to a new, unused patch file, and run `git apply --cached` on that file.                                                        | `git apply` finds each hunk by its 3 context lines, so a skipped earlier hunk does not move a later one. If the copy fails, the new file does not exist and `git apply` stops with an error, so it cannot stage the full diff or an old patch. |
| One hunk that mixes two units | Build the unit's version of the file from `git show :<path>`. Run `git hash-object -w <file>`, then `git update-index --cacheinfo <mode>,<sha>,<path>`, with `<mode>` from `git ls-files -s <path>`. | The working tree does not change, and the file keeps its mode.                                                                                                                                                                                 |
| Part of a new file            | Run `git add -N <path>`, then use the patch method.                                                                                                                                                  | `git diff` does not show untracked files until they are in the index.                                                                                                                                                                          |

## Committing given paths

`only` stages no file content. It runs `git commit --only -- <paths>`, which commits the working tree version of the paths and keeps other staged changes staged.
Before that, it runs `git add -N -- <paths>` once: without an index entry, `git commit` rejects a new file with `pathspec '<path>' did not match any file(s) known to git`.
`--only` takes whole files, so `only` does not split a file across commits. The hunk methods above write the index, and that would change the other staged changes.

## Parallel sessions

`parallel` lets two or more sessions commit on the same branch in one checkout. The other commands share one `.git/index`, so a `git commit` in one session takes the hunks that another session staged a moment earlier. For the methods compared and the tests, see [parallel commits](../../../../docs/research/commands/parallel-commits.md).

| Problem                                                                                | Method in `parallel`                                                                                                                           | Why it works                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shared index holds the stage of other sessions.                                    | Build each commit in `GIT_INDEX_FILE=<dir>/index`, started with `git read-tree <base>`, then `git write-tree` and `git commit-tree -p <base>`. | `git add`, `git apply --cached`, and `git update-index` write only the file that `GIT_INDEX_FILE` names.                                                                                                                                                                                                                                    |
| Two sessions commit at the same moment.                                                | `git update-ref HEAD <commit> <base>`.                                                                                                         | `update-ref` moves the branch only if it still points to `<base>`. Otherwise it fails with `is at <sha> but expected <base>`, and the session builds the unit again on the new `HEAD`.                                                                                                                                                      |
| A commit built on an old base reverts the commit of another session.                   | Every patch, file version, and the private index start from the same literal `<base>`, and `update-ref` checks that same `<base>`.             | A tree from an old base can never become the branch tip.                                                                                                                                                                                                                                                                                    |
| After the commit, the shared index still holds the old content of the committed paths. | `git reset -q -- <unit paths>`.                                                                                                                | It sets only those paths to the new `HEAD`. Without it, `git status` in the other sessions shows the committed hunks as staged reversals, and a later `git commit` from the shared index reverts them. It is the only write to the shared index, so when another session holds `.git/index.lock`, the session runs it again, up to 3 times. |

`git commit` with a private index is not enough. It checks that `HEAD` does not move during the commit, but not since `read-tree`. If another session commits in that interval, the commit silently reverts that work.

The method has these limits:

- `git commit-tree` runs no hooks: no `pre-commit`, no `commit-msg`, and no [`format-staged-files`](../../../hooks/format-staged-files/README.md). The `PostToolUse` formatters already ran when the session edited the files, and `parallel` writes no files.
- `git commit-tree` ignores `commit.gpgSign`. To sign, add `-S` to the `commit-tree` step.
- `git reset -q -- <paths>` also unstages changes that you staged yourself in those paths. The changes stay in the working tree.
- The safety holds only while every session that commits uses `parallel`. A session that stages in the shared index can still put the hunks of another session in its commit.
- Git cannot split a hunk that two sessions both edited. `parallel` leaves such a hunk uncommitted.
- `allowed-tools` uses rules such as `Bash(GIT_INDEX_FILE=* git apply *)`. Claude Code does not match an allow rule past the assignment of a variable that is not on its list of known-safe variables, so the rules name the assignment. The command uses literal SHAs in separate calls, not shell variables, so that each call is one simple command.

`commit:any` never routes to `parallel`: it cannot detect other sessions.

## Auditing commits

`audit` checks the commits of the other commands after they exist. It holds a list of rules per command: which commands treat a hunk of another session as an error. Change that list when a command changes which changes it takes.

The evidence comes from the session transcripts, one `<session-id>.jsonl` file per session in `~/.claude/projects/<project>/`. Each file edit is a `tool_use` entry named `Edit` or `Write`.

| Problem                                                    | Method in `audit`                                                                                | Why it works                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| The command must find the project directory of the repo.   | `fd -t f '${CLAUDE_SESSION_ID}.jsonl' ~/.claude/projects`.                                       | Claude Code replaces `${CLAUDE_SESSION_ID}` in the command text. The directory of that file is the project folder. |
| Its own transcript matches every search for its own edits. | `rg --glob '!${CLAUDE_SESSION_ID}*'`.                                                            | The glob also excludes the session folder, which holds its subagent transcripts and large tool results.            |
| A transcript can be several MB.                            | Search with `rg -l -F` for the path, then for one line of the hunk. Never read a whole file.     | `-l` prints only the names of the matching transcripts.                                                            |
| An audit in a new session has no conversation to read.     | `rg -l -F '<short sha>'` finds the transcript that printed the commit, and its `<command-name>`. | Every commit command prints `<short sha> <subject>` per commit.                                                    |

The method has these limits:

- Transcripts store text JSON-escaped. A line with a quote or a backslash does not match `rg -F`, so the command searches with a line of 20 or more characters that has neither.
- The host and the devcontainer each keep their transcripts in their own home directory. An audit on the host cannot see the sessions in the devcontainer, and the reverse. Their hunks show as `unknown`.
- A hunk that a formatter or lint hook wrote is not in any `Edit` entry. The command ties it to the session that edited the file last.

## Checks

- Before each commit, the model reads `git diff --cached -- <path>` for every partly staged file. This catches a hunk in the wrong place. The commands do not run tests, because the test command differs per project and a test run slows every commit.
- A failed git command stops the run. An editor that refreshes git status (for example `git-auto-refresh` in Emacs) can hold `.git/index.lock` for a moment. In one session, `git restore --staged` failed on the lock, the next commands ran anyway, and they staged the wrong hunks.

## Context size

`conversation`, `multiple`, and `task` load `git diff HEAD --stat`, not the full diff. A large diff (88 KB in one session) goes to a file instead of into the context, and these commands read hunks per unit anyway. `extend` also loads `--stat`: it keeps the original message and needs only the changed paths to find the target commit. `single` and `push` keep the full diff, because they write one message from all of it. Fewer context lines do not pay off there: over 50 commits in this repository, `-U0` cut the diff by 13%.

## Permissions

`allowed-tools` lists every git subcommand a method needs: `apply`, `show`, `hash-object`, `update-index`, `ls-files`. A missing entry causes a permission prompt on each call, or the model falls back to `git add` on the whole file. It also lists every command of the Context block: outside bypass and auto mode, a context command that no rule allows stops the invocation with `Shell command permission check failed`.
