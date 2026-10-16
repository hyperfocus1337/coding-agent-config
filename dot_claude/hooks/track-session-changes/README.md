# track-session-changes

A hook that logs each file a session changes, with the tool, the call window, the first changed line, and the git blobs of the file before and after the call. It runs for Claude Code and Codex as a command hook: `node hook.ts <agent>`. The logic is in `core.ts`, which has no dependency. The [pi extension](../../../dot_pi/agent/extensions/track-session-changes/README.md) imports it in-process for pi and omp. The [`session-files`](../../skills/session-files/) skill reads the log.

## Log

Each session writes one log: `~/.local/state/agent-changes/<agent>/<session id>.tsv`, with `claude`, `codex`, `pi`, or `omp` as the agent. Subagent calls carry the session ID of the main session, so they go to the same log. One line per file per call, tab-separated:

| Field  | Example                    | Note                                                          |
| ------ | -------------------------- | ------------------------------------------------------------- |
| start  | `2026-10-14T09:12:03.120Z` | UTC with milliseconds                                         |
| end    | `2026-10-14T09:12:03.480Z` | UTC with milliseconds                                         |
| tool   | `Bash`                     | `Bash`, `Edit`, `Write`, `NotebookEdit`, or `apply_patch`     |
| status | `M`                        | `A`, `M`, or `D`. A type change, such as file to link, is `M` |
| repo   | `/Users/me/repo`           | Top of the git work tree. Empty outside a repo                |
| path   | `/Users/me/repo/x.org`     | Absolute                                                      |
| line   | `412`                      | First changed line after the call. Empty for `D` or unknown   |
| before | `3b18e512dbc8…`            | Git blob ID of the file before the call. Empty for `A`        |
| after  | `9daeafb9864c…`            | Git blob ID of the file after the call. Empty for `D`         |

A line with 7 fields has no `before` and `after`. A blob ID is empty also when the hook cannot know it, see [Blobs](#blobs). The `agent-changed-files` package of the chezmoi repo reads the blobs to find the changes of one session in a file.

## What it records

| Tool                     | Events                                                   | Files                                      | Line                                                                             |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Claude Code Edit         | `PostToolUse`                                            | `tool_input.file_path`                     | First hunk of `structuredPatch` in the result                                    |
| Claude Code Write        | `PostToolUse`                                            | `tool_input.file_path`                     | The same. A new file has no hunks: line 1                                        |
| Claude Code NotebookEdit | `PostToolUse`                                            | `tool_input.notebook_path`                 | First line that differs between `original_file` and `updated_file` of the result |
| Claude Code Bash         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`        | Snapshot difference                        | First hunk of `git diff-files -p -U0`                                            |
| Codex Bash               | `PreToolUse`, `PostToolUse`, also after a failed command | Snapshot difference                        | The same                                                                         |
| Codex `apply_patch`      | `PreToolUse`, `PostToolUse`                              | `*** Add/Update/Delete File`, `Move to`    | From the snapshot. A new file outside it: 1                                      |
| Both agents, any event   | `SessionStart`                                           | None: deletes logs and state after 30 days | None                                                                             |

## Blobs

The hook stores the blobs of each logged file in `~/.local/state/agent-changes/<agent>/<session id>/objects/`, a git object directory beside the log. In the devcontainer, the bind mount of the log tree puts these blobs on the host disk too. The hook reads the objects of the repo as an alternate, so a blob that the repo holds is not copied.

| Tool                         | Before blob                                                                                | After blob       |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| Claude Code Edit and Write   | `originalFile` of the result, with the line endings of the file. Else a rebuild of an Edit | The file on disk |
| Claude Code NotebookEdit     | `original_file` of the result                                                              | The file on disk |
| pi and omp edit and write    | The files that the input names, read at the tool call                                      | The file on disk |
| Bash, `apply_patch`          | The index entry of the file in the snapshot of the call                                    | The file on disk |
| A file that the call made    | None                                                                                       | As above         |
| A file that the call deleted | As above                                                                                   | None             |

A before blob is missing for a file with mixed line endings, for an Edit whose rebuild fails, and for an `apply_patch` file outside every snapshot repo.

A tool that names its files also logs a file outside every repo and a git-ignored file. A failed Edit or Write returns an error string and no `structuredPatch`, so the hook logs nothing for it. A failed NotebookEdit sends no `PostToolUse`. `MultiEdit` is in the matcher of the format hooks, but Claude Code has no such tool, so this hook ignores it.

## Snapshots

Bash names no file, so the hook stores the work tree in a git index before the call, and after the call logs the files that differ from that index. It snapshots the repo of the working directory and each repo in the repo field of the session log. `apply_patch` also snapshots the repos of its files. The blobs of a snapshot go to the session `objects/`, see [Blobs](#blobs). The snapshot state is in `~/.cache/track-session-changes/<agent>/<session id>/`:

| Path                   | Content                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `index/<hash>`         | The git index of one repo, named by the SHA-1 of the repo path                         |
| `repos.json`           | The repo of each directory that a call looked up                                       |
| `pending/<id>`         | The start time and the repo records from `PreToolUse`, removed at the end of the call  |
| `calls/<id>.<n>.index` | A link to the index of repo n at the start of the call, removed at the end of the call |

For how a snapshot works, how the line comes from the diff, and the measured cost, see [docs/implementation.md](docs/implementation.md).

## Failure behavior

The hook always exits 0 and prints nothing. The command in `settings.json` and in `~/.codex/hooks.json` exits 0 when `node` is not on `PATH`. A failed snapshot skips that repo. A failed patch diff keeps the paths with an empty line.

## Limits

- A Bash call snapshots only the repo of its working directory and the repos in the session log. So a Bash write to another repo is not logged until a tool that names its files changes that repo, or a call runs with its working directory there. Bash writes to git-ignored files are not logged.
- A Bash snapshot cannot tell which process wrote a file. A file that another process changes during the call is logged as a change of the call. The overlap filter of the `agent-changed-files` package drops such a write when another session logged it with a tool path.
- A background Bash call (`run_in_background`) returns before the command ends, so the hook misses its later writes.
- A call that the user denies leaves a pending file and its index links. The prune deletes them after one day.
- The prune deletes the `objects/` of a session when both its log and its state are gone, so after 30 days of no use.
- A blob ID is the SHA-1 of git. A repo with SHA-256 object names gets IDs that it does not hold.

## Test

```bash
node test/check.ts
```
