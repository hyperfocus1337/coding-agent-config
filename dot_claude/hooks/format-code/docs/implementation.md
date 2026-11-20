# format-code implementation

The design of [`format-code`](../README.md) that is the same for each formatter: the sweep of a Bash call, the events, and the amend hint. [`oxfmt.md`](oxfmt.md) and [`org-tables.md`](org-tables.md) give the design of those formatters. The README tells what the hook does.

## The Bash sweep

A Bash call has no `file_path`, but a shell command (`sed`, `perl`, `echo`, a redirect, a script) can change files. So on a Bash call, the hook sweeps for the files with an extension that a formatter takes after a Bash call, in [`sweep.ts`](../sweep.ts):

1. It takes each such path that the command names. See [Paths the command names](#paths-the-command-names).
2. It finds the roots: the session folder and each absolute path in the command, each resolved to its git top level. See [Bash edits in other repositories](#bash-edits-in-other-repositories).
3. In each root, it lists the files that changed against `HEAD` (`git diff --name-only --diff-filter=d HEAD`) and the untracked files (`git ls-files --others --exclude-standard`).
4. If the command commits, it also lists the files of the last commit. See [Write and commit in one command](#write-and-commit-in-one-command).
5. A folder entry in a list is a repository inside the root, and becomes a root of its own. See [Nested repos and submodules](#nested-repos-and-submodules).
6. It keeps a file only if the file changed after the call started. See [Only the files of the call](#only-the-files-of-the-call).

One sweep serves all formatters, so a Bash call costs 1 `git rev-parse` for each root and 2 git listings for each repository.

### Paths the command names

The sweep asks git what changed, so it cannot find a file that git does not report. The hooks run after the full command ends. A command that writes `docs/refactor.md` and adds it to `.gitignore` leaves a file that `git ls-files --others --exclude-standard` does not list.

So before the hook asks git, it takes each path in the command text with an extension of the sweep. An absolute path stays as it is, and a relative path resolves against the session folder. A file that the command names is a file that the model writes now, so it gets a format pass that the other ignored files do not get. Here, git has an instruction to ignore the file, and the hook formats a named path without a question to git.

- A named path that is not a file drops out at the file check.
- A named file is formatted also when the session folder is in no repository.
- A `cd` in the command does not change the session folder, so a relative path after a `cd` can resolve to the wrong file. The file check or the start time then skips it. The sweep of the root still finds the right file if git reports it.

### Bash edits in other repositories

The session folder of the hook does not change when the command runs `cd`. A command such as `cd /other/repo && cat > UPGRADING.md <<'EOF'` writes a file in a different repository.

So the sweep has more than one root: the session folder, and each absolute path in the command. A folder counts as it is, and the hook uses the parent folder of any other path. The hook resolves each root to its git top level and removes duplicates.

- A path that is not in a repository drops out with no message.
- A path that does not exist drops out if its parent folder does not exist. If the parent folder is in a repository, that repository becomes a root.
- A command that names no absolute path sweeps only the session folder.

The hook follows only absolute paths. A relative path is ambiguous after a `cd`, and a wrong guess sweeps the wrong repository. So the hook misses an edit in a different repository after a relative `cd ../other-repo`: use an absolute path, or make the edit with a Write or an Edit. A `shortcut:` comment in `sweep.ts` marks this limit.

The hook also sweeps a repository whose absolute path a command only reads from. It formats only the files there that changed during the call.

### Nested repos and submodules

A git repository inside a repository is opaque to the parent repository, so the sweep of the parent cannot see its files.

- **An embedded repository** shows in `git ls-files --others` as one `nested/` entry, not as the files in it.
- **A submodule** shows in `git diff HEAD` as a gitlink path.
- **A worktree in the repository** (`git worktree add .worktrees/feat`) shows as one `.worktrees/feat/` entry, because the folder holds a `.git` file and no tracked content. This is the most frequent case here.

The roots are a queue. The sweep lists the files of one root and adds each folder entry to the queue as a new root, with its own git top level. For a worktree, `git rev-parse --show-toplevel` gives the worktree path, so the hook sweeps the worktree as a root of its own.

The sweep continues until the queue is empty, so it covers each nesting depth. The roots are a set, so a symlink that points back to a root does not add that root a second time and cannot cause a loop.

### Only the files of the call

The sweep lists each changed and untracked file of a root, also a file that changed hours before the call. So the hook keeps a file only if its mtime is at or after the start of the call, rounded down to the second, so that a file system with 1 s mtimes does not miss a write. The Claude Code mod takes the start time before the call runs. pi and omp take it in `tool_call`. A file that the command only read stays as it is: `sed -n '1,20p' config.org > copy.org` names the live config, but the config did not change during the call.

A Codex hook runs only after the call, so it has no start time. There, a file counts if it changed in the last 120 s. A command that writes a file and then runs for more than 120 s misses that file in Codex.

A file that another program changed during the call also counts, for example a file that an editor saved. `track-session-changes` finds the files of a call with a snapshot before and after the call, but its log must hold the text after the format hooks ran. So the format hooks cannot wait for that log, see [the decision](../../../../docs/hooks/decisions.md#the-format-hooks-find-the-files-of-a-shell-call-themselves).

### How the sweep grew

The first sweep, in `format-prettier`, covered only the git top level of the session folder and only Markdown. The roots from the absolute paths in the command, and then the queue of roots for nested repositories, came next. `format-org-tables` and `format-terraform` read only the paths in the command text, followed each `cd`, and took a named path only when its mtime was at most 120 s old. They missed a file that a script wrote, a `cd` to `~` or to a folder with a variable, and a command that ran for more than 120 s after its write.

On 2026-11-08 the three format hooks moved to one sweep in a copy of `sweep.ts` in each folder, with the start time of the call. The same day, the three hooks became one, so one sweep serves all formatters.

## Write and commit in one command

One Bash call can write a file, commit it, and push it: `cat > README.md <<'EOF' ... && git commit -am docs && git push`. When the hook runs, the working tree is clean, so the working-tree sweep finds no files. The pushed commit holds the unformatted text.

So when the command runs `git commit`, also with global options as in `git -C <dir> commit`, the sweep also takes the files of the last commit in each root: `git diff-tree --no-commit-id --name-only -r --root --diff-filter=d HEAD`. `--root` makes this work for the first commit of a repository, which has no `HEAD~1`.

The format changes the file, not the commit. Only the model can amend the commit, so the hook gives the model the amend hint, see [What the model sees](../README.md#what-the-model-sees).

### The change test

The hook compares the text of each file before and after the formatter run. It reads the text only when the call commits.

An earlier version of `format-org-tables` used `git diff --quiet` on the working tree. That test could not tell the format of the hook from a change that was already in the file. A second session that edited the same file then made the hook report a commit that held nothing to amend. If the model followed that hint, it put the work of a different author into its own commit.

`format-code` read the stdout of each formatter before 2026-11-08: `terraform fmt` and `shfmt -l` print the name of a changed file, and ruff prints `reformatted`. The text compare works for each formatter, also for oxfmt and Emacs, which print nothing useful, so a formatter module needs no change test of its own.

## Why after each call, and not Stop

[`type-check-code`](../../type-check-code/README.md) runs on `Stop` because they are loud and project-wide: on each edit they reran the whole project and printed the same unrelated errors again. That argument does not carry over to this hook, for two reasons.

**It costs almost no context.** The hook writes nothing for the model, except the amend hint. That hint comes only when one Bash call both writes and commits a file. 40 calls in one turn cost 40 formatter runs and close to zero context.

**It has to run for each edit, not for each turn.** The model reads a file back after it writes it. If the format waits until the turn ends, the model works all turn against text that does not match the file on disk, and a table that the model edits stays without alignment while it edits it.

One argument favours a later format: a format directly after a Write makes the copy of the file that the model has stale. That gives a "changed on disk" notice and can make a later Edit miss on `old_string`. The changes are small, so a miss needs the model to target the exact line that the formatter changed. Formatted text while the model works is worth more.

A turn end has no tool call, so `format` would get neither a file path nor a command. A `Stop` wiring needs new code, not only a new entry.

## Code mode: format at the end of a REPL block

Measured on 2026-11-19 with Claude Code 2.1.328, in interactive sessions in scratch repos:

- The inner calls of a `REPL` block reach the mod as normal `tool.call` events. Their `tool_use_id` starts with `repl_`, which no document names, and no field names the block. A subagent call carries `agentId`.
- With a format after each call, a block that writes a file and then edits it fails at the edit with "File has been modified since read" or "String to replace not found in file".
- The mod gets no event for the `REPL` call itself. The `classic.*` hooks of a user mod do not run: the built-in `cc-plugin-sec-default` bypasses them. Only a settings command hook sees the block: `PreToolUse` before the first inner call, and `PostToolUse` after the last.
- A format in the `PostToolUse` `REPL` command hook works: the model got the `edited_text_file` notice before its next block, and that block's edit passed.

Options not taken:

- **A format at `turn.complete` only:** the settings `Stop` hooks, `lint-code` and `type-check-code`, run before it and see unformatted files.
- **A format at the start of each `turn.step`:** the model gets the change notice one request too late, so the next block works on stale text.
- **A separate settings entry for `track-session-changes`:** settings hooks that match the same event run in parallel, so the log step must follow the format in one command.

Limits:

- The `repl_` prefix is not documented. If it changes, the mod formats each call again, as before code mode.
- An interrupted inner call can end after `turn.complete`. Its file waits for the next block end, turn end, or session end.
- `session.end` gives all hooks 1.5 s, so a long format there can stop halfway.
- A turn that ends with deferred calls formats them after `lint-code` and `type-check-code` ran.

## Why a failed Bash call is formatted too

A Claude Code `PostToolUse` command hook fires only after a tool call succeeds. A Bash command that exits with a code other than 0 raises `PostToolUseFailure`, a separate event. [`research.md`](research.md#a-bash-command-that-fails) gives the measurement.

The gap covers the write-then-verify shape, which is most of what a shell command does here: `cat > notes.org <<'EOF' ... EOF && just fmt-check` writes the file, then a later step fails, and the format never ran on the file that the model edits next.

Each adapter runs on a failed call:

- The mod runs after `next` for each result. It skips a call that was denied.
- pi and omp send `tool_result` for each result.
- Codex runs `PostToolUse` also after a Bash command that exits with a code other than 0.

The sweep also runs after you interrupt a shell command. A half-written file from an interrupted command is still a file worth formatting, and a formatter failure on one is ignored.

`command.ts` sends the amend hint as `hookSpecificOutput`. Its `hookEventName` field selects the schema of one event, so it must name the event that fired. `command.ts` reads `hook_event_name` from the payload and sends it back, and uses `PostToolUse` only when the payload has none.

## Events that do not apply

`SessionEnd` is wrong for any hook whose result the model must act on. Its output goes to stderr during shutdown, so no model turn reads it, and it runs under a 1500 ms default limit that a hook `timeout` raises only to 60 s. A sweep that stops halfway leaves some files formatted and some not.

`PostToolBatch` fires once after a batch of parallel tool calls, so it would merge several sweeps into one. The sweep is already cheap and idempotent, so this gives speed, not correctness.

An `async: true` command hook would move the sweep off the critical path. Then the hook would change files while the model already reads them.

## The `/private` prefix on macOS

macOS resolves `/tmp` to `/private/tmp` and `$TMPDIR` to `/private/var/folders/...`. The path in a payload holds that prefix, but `$TMPDIR` does not. So both sides of the comparison drop a leading `/private`.
