---
disable-model-invocation: true
---

# Commit command implementation notes

Why the commit commands stage, check, and load context the way they do. For which command to pick, see [`../README.md`](../README.md).

After `## Context` and `## Your task`, a command puts the constraints that hold for every step under `## Rules`, and the print format under `## Output`. `plan` and `audit` have no `## Output`, because their output format is a step.

## Shared text

Some text appears in more than one command. When you change it in one command, change it in each command of its row.

| Text                                  | Commands                                            | Note                                                                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Commit** step                       | `conversation`, `multiple`, `split`, `task`         | `task` holds the same methods in its **Stage** and **Verify** steps, and makes one commit, so it has no chain sentence. Only `conversation` drops the diff read before a whole-file stage: `multiple` and `split` need that read to group. |
| **Lists** and **Group** steps         | `conversation`, `parallel`                          | The **Commit** step of `parallel` uses the same three methods, but against a private index and `<base>`.                                                                                                                                   |
| **Repositories** step                 | `conversation`, `multiple`, `task`                  | The last bullet differs per command: what to commit in an external repository. `conversation` has none.                                                                                                                                    |
| Sentence that follows a `plan` result | `conversation`, `multiple`, `task`, `extend`, `any` |                                                                                                                                                                                                                                            |

`plan` holds no copy of these steps: a `cat` of the target command file in its last section puts the current text in the prompt. The file name comes from the first argument, so the shell sees that word: `plan` is for arguments that you type yourself, so it has `disable-model-invocation: true`. A first word with a quote character stops the invocation with a shell error.

## Staging part of a file

When one file holds changes of two units, each commit must stage only its own part. The obvious methods fail without a terminal or place hunks in the wrong spot. So `conversation`, `multiple`, `split`, and `task` name the methods to avoid and the methods to use.

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

[`stage-replace.py`](scripts/stage/stage-replace.py) is a shortcut for the two partial cases when the change of the unit in a file is at most 3 text replacements. It applies each replacement to the staged version of the file and writes the result to the index, so the model writes no patch and no file version. It stops when an old text does not occur exactly once in the staged version, or when a new text is not in the working file. `conversation`, `multiple`, `split`, and `task` name it in their staging step. `parallel` runs it with `GIT_INDEX_FILE` set, so that it writes only the private index.

On a fixture with two partly staged files, 5 interleaved pi runs went from about 37 s to 19 s of model time, and the model still reads the staged diff before each commit.

## Committing given paths

`only` stages no file content. It runs `git commit --only -- <paths>`, which commits the working tree version of the paths and keeps other staged changes staged.
Before that, it runs `git add -N -- <paths>` once: without an index entry, `git commit` rejects a new file with `pathspec '<path>' did not match any file(s) known to git`.
`--only` takes whole files, so `only` does not split a file across commits. The hunk methods above write the index, and that would change the other staged changes.

## External repositories

A session can edit files in other git repositories, for example a sibling checkout. The Context block of each command runs in the working directory only, so without help the model does not see those changes and leaves them uncommitted.

In their **Repositories** step, `conversation`, `multiple`, and `task` find the other repositories from the files the session edited, and `plan` applies that step: `git -C <dir> rev-parse --show-toplevel` on the nearest existing directory of each file that the status of the Context block does not list. A listed file is in this repository, so it needs no probe. A top level other than the one in the Context block is a candidate. A candidate that is a disposable fixture, such as a pilot repository made for a test, or that holds only generated output, stays out unless the user asks for it: discovery finds repositories, it does not make them commit targets. The commands run the same steps there, with `-C <repo>` after `git`, so the same staging methods and checks apply.

`plan` prints one section per repository and numbers the commits across the sections, so "merge 1 and 2" still names commits without ambiguity. `conversation` and `task` list each edited path that they left out, in a fixture repository or in no repository, under a `Left out, <reason>:` group, so that a skipped path is visible.

The method has these limits:

- A repository where the session ran commands but edited no file stays out.
- In an external repository, `multiple` takes every change, also changes that were there before the session.
- `parallel` and `audit` work in the working directory only.

An external repository can have no commits, and then `git diff HEAD` fails. `plan` therefore reads `git diff --cached --stat` and `git diff --stat`, which need no commit, in one Bash call with the status. Neither diff shows untracked files, so `plan` takes them from `git status --untracked-files=all`. A probe result that the step expects, such as `not a git repository`, is not a failure. Any other failure stops `plan` with an error report instead of a plan: a failure listed under "Left out" looks like a complete plan.

## Parallel sessions

`parallel` lets two or more sessions commit on the same branch in one checkout. The other commands share one `.git/index`, so a `git commit` in one session takes the hunks that another session staged a moment earlier. For the methods compared and the tests, see [parallel commits](../../../../docs/research/commands/parallel-commits.md).

| Problem                                                                                | Method in `parallel`                                                                                                                                                   | Why it works                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shared index holds the stage of other sessions.                                    | Build each commit in `GIT_INDEX_FILE=<dir>/index`, started with `git read-tree <base>`, then `git write-tree` and `git commit-tree -p <base>`.                         | `git add`, `git apply --cached`, and `git update-index` write only the file that `GIT_INDEX_FILE` names.                                                                                                                                                                                                                                    |
| Two sessions commit at the same moment.                                                | `git update-ref HEAD <commit> <base>`.                                                                                                                                 | `update-ref` moves the branch only if it still points to `<base>`. Otherwise it fails with `is at <sha> but expected <base>`. The helper reapplies the immutable reviewed patch to the new base and retries without model turns.                                                                                                            |
| A commit built on an old base reverts the commit of another session.                   | The reviewed patch is saved once with binary data and full blob IDs. Each attempt applies it to one base, then uses that base for both `commit-tree` and `update-ref`. | A tree from an old base can never become the branch tip.                                                                                                                                                                                                                                                                                    |
| After the commit, the shared index still holds the old content of the committed paths. | `git reset -q -- <unit paths>`.                                                                                                                                        | It sets only those paths to the new `HEAD`. Without it, `git status` in the other sessions shows the committed hunks as staged reversals, and a later `git commit` from the shared index reverts them. It is the only write to the shared index, so when another session holds `.git/index.lock`, the session runs it again, up to 3 times. |

`git commit` with a private index is not enough. It checks that `HEAD` does not move during the commit, but not since `read-tree`. If another session commits in that interval, the commit silently reverts that work.

The first call and each publish call of `parallel` end with `git rev-parse HEAD`, and the last publish call ends with `git status`, so the base of a unit costs no model turn of its own. In 6 interleaved pi runs with 3 commits, this cut the turns from 13 to 8 and the model time from 63 s to 45 s.

After review, [`commit-parallel.py`](scripts/parallel/commit-parallel.py) runs the mechanical sequence in one process. It permits at most 10 attempts within a 30-second retry window, with short randomized waits; Git processes already running are not interrupted. A patch that no longer applies cleanly stops retries for ownership review, not automatic conflict resolution. The helper never rereads working files or runs `git add` on retry.

The helper prints the commit before refreshing the shared index. A refresh failure reports that the commit exists, so the session must not publish the unit again. Retry exhaustion reports pending reviewed changes instead of claiming that there is nothing to commit.

The method has these limits:

- `git commit-tree` runs no hooks: no `pre-commit`, no `commit-msg`, and no [`format-staged-files`](../../../../dot_config/git/hooks/format-staged-files/README.md). The `PostToolUse` formatters already ran when the session edited the files, and `parallel` writes no files.
- `git commit-tree` ignores `commit.gpgSign`. The helper does not request signed commits.
- `git reset -q -- <paths>` also unstages changes that you staged yourself in those paths. The changes stay in the working tree.
- The safety holds only while every session that commits uses `parallel`. A session that stages in the shared index can still put the hunks of another session in its commit.
- Git cannot split a hunk that two sessions both edited. `parallel` leaves such a hunk uncommitted.
- Preparation uses literal SHAs and rules such as `Bash(GIT_INDEX_FILE=* git apply *)`. Publication uses the installed Python helper, whose permission rule names its path. Permission matching outside bypass mode has not been verified.

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
- The commit runs in a new Bash call, after the model reads the check. In one session, one call held a hunk split, `git apply --cached`, the check, and the commits of two units. The split failed, the next line ran `git add` on the whole file, and both units went into one commit. The model saw the check output only after both commits.
- A commit call can continue with `&&` into the stage and check of the next unit, or into the last status. The commit is the first command of the call and the only commit in it, so it still runs after the model read its check, and a failed commit stops the stage after it. A unit of whole files is staged and checked in one call, so a run with no file to probe starts with the stage of its first unit.
- A partial method and its check share one Bash call, after one call that reads the diff and the mode. Without this rule, the model spent a turn on each part: the patch, the file version, `git hash-object`, `git update-index`, and the check. In 10 interleaved runs on a fixture with two partly staged files, the rule cut the turns from 8.8 to 6.4 and the model time by 15%.
- These chains exist because each model turn has a fixed cost: about 5 seconds with `gpt-6.1-sol` in pi. In 25 runs on a 3-commit fixture, they cut the turns of `conversation` from 9 to 5 and its model time by 42%. For 69 logged runs with file splits and long contexts, the estimate is 10%.
- The model picks the hunks of a unit by their text. In the same session, it took start lines from a `-U1` diff and matched 0 hunks of the `-U3` patch: more context lines move the start lines and merge neighboring hunks.
- A failed git command stops the run. An editor that refreshes git status (for example `git-auto-refresh` in Emacs) can hold `.git/index.lock` for a moment. In one session, `git restore --staged` failed on the lock, the next commands ran anyway, and they staged the wrong hunks. Since then, a staging command that fails on the lock waits 10 seconds and runs once more if the stage holds only its own changes. The commands never remove the lock, because no check proves that it is stale. They run `git --no-optional-locks status`, so that they do not take the lock themselves to refresh the index.

## Context size

`conversation`, `multiple`, and `task` load `git diff HEAD --stat`, not the full diff. A large diff (88 KB in one session) goes to a file instead of into the context, and these commands read hunks per unit anyway. `extend` also loads `--stat`: it keeps the original message and needs only the changed paths to find the target commit. `single` and `push` keep the full diff, because they write one message from all of it. Fewer context lines do not pay off there: over 50 commits in this repository, `-U0` cut the diff by 13%.

## Permissions

`allowed-tools` lists every git subcommand a method needs: `apply`, `show`, `hash-object`, `update-index`, `ls-files`. A missing entry causes a permission prompt on each call, or the model falls back to `git add` on the whole file. The hand methods for a partial file also need a heredoc, a redirect, or `$(git hash-object …)`, which no rule in the list allows: in 3 headless Claude Code runs with permission checks on, each run had 6 to 9 denied calls before it reached a form that passed. The helper call matches one rule. It also lists every command of the Context block, such as `Bash(git rev-parse:*)` for the top level: outside bypass and auto mode, a context command that no rule allows stops the invocation with `Shell command permission check failed`.

For external repositories, `allowed-tools` holds one `Bash(git -C * <subcommand> *)` rule per subcommand that the command uses without `-C`. One `Bash(git -C:*)` rule would be shorter, but it also allows `git -C <repo> push` and `git -C <repo> reset --hard`.
