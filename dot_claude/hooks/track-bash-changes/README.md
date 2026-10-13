# track-bash-changes

A `PreToolUse`, `PostToolUse`, and `PostToolUseFailure` hook on Bash that logs which files each Bash call changed in the git repo of the session working directory. The [`session-files`](../../skills/session-files/) skill combines this log with the Edit and Write calls from the session transcript.

## Why a hook

The session transcript records the path of each Edit and Write call, but a Bash call has no path field. A parser of the command text cannot see what `just`, `pnpm install`, a Python script, or `git stash pop` writes. This hook measures the result on disk, so it works for every command.

## How it works

For one Bash call followed step by step through `hook.sh`, with the real output of each command, see [docs/walkthrough.md](docs/walkthrough.md). For the time and disk cost, and for the first snapshot design that this one replaced, see [docs/performance.md](docs/performance.md).

### Flow per Bash call

1. `PreToolUse` writes the working tree as a git tree object and stores the repo path and the tree ID under the `tool_use_id`.
2. `PostToolUse`, or `PostToolUseFailure` when the command fails, writes a second tree of the same repo and runs `git diff-tree` between the two trees.
3. Each changed path goes to `bash-changes.tsv` as one line: UTC time with milliseconds, status (`A`, `M`, `D`), and absolute path.

The trees compare content, not `git status`, so a second change to a file that was already modified also shows up.

### Snapshots

The hook keeps one git index per session and repo. The first snapshot starts from a copy of the repo index. Each snapshot feeds the modified, untracked, and deleted files from `git ls-files` to `git update-index --info-only`, then runs `git write-tree --missing-ok`. Because the index keeps the stat data of the last snapshot, git rehashes only the files whose size or mtime changed.

`--info-only` hashes a file without storing it, so the object directory holds only trees. It reads the repo objects as an alternate, and the hook never writes to the repo index or the repo object database. Parallel Bash calls share the index, so each snapshot works on a copy and renames it back.

### Session files

All state sits in `<transcript dir>/<session id>/`, next to the `subagents/` and `tool-results/` folders of Claude Code.

| Path                | Content                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `bash-changes.tsv`  | The log that `session-files` reads.                                |
| `bash-pending/<id>` | Repo path and tree ID from `PreToolUse`, removed at `PostToolUse`. |
| `bash-index/<hash>` | The index of one repo, named by the hash of the repo path.         |
| `bash-objects/`     | The tree objects of the snapshots.                                 |

A subagent transcript sits under `<session id>/subagents/`, so the hook cuts the transcript path at the session ID. Subagent Bash calls go to the same log as the main session.

### Paths

The repo path keeps symlinks (`pwd -L`, not `git rev-parse --show-toplevel`), so a Bash path matches the Edit and Write path of the same file in the transcript. `PostToolUse` reads the repo path from `bash-pending/`, so a different `cwd` after the call does not change which repo it compares.

### Failure behavior

The hook always exits 0 and prints nothing. It stops early when `jq` or `git` is missing, or when the session working directory is not in a git repo. A failed snapshot skips the call and does not block it.

## Limits

- Only the repo of the session working directory at `PreToolUse`. Files outside it (`/tmp`, `~`, other repos), files in `.gitignore`, and files in nested repos are not logged.
- A file that you or another process changes while a Bash call runs is logged as a change of that call.
- When Bash calls run in parallel, their time windows overlap, so one change can be logged twice. The paths are still correct, but the change count in `session-files` can be too high.
- A background Bash call (`run_in_background`) returns before the command finishes, so the hook misses its later writes.
- A Bash call that the user denies leaves a file in `bash-pending/`. It does no harm.

## Test

```bash
bash test/test.sh
```
