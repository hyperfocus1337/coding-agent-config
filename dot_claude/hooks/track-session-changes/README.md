# track-session-changes

A hook that logs each file a session changes, with the tool, the call window, and the first changed line. It runs for Claude Code and Codex as a command hook: `node hook.ts <agent>`. The logic is in `core.ts`, which has no dependency. The [pi extension](../../../dot_pi/agent/extensions/track-session-changes/README.md) imports it in-process for pi and omp. The [`session-files`](../../skills/session-files/) skill reads the log.

It replaces [`track-bash-changes`](../track-bash-changes/). Until the `agent-changed-files` package in the chezmoi repo reads the new log, both hooks run side by side.

## Log

Each session writes one log: `~/.local/state/agent-changes/<agent>/<session id>.tsv`, with `claude`, `codex`, `pi`, or `omp` as the agent. Subagent calls carry the session ID of the main session, so they go to the same log. One line per file per call, tab-separated:

| Field  | Example                    | Note                                                          |
| ------ | -------------------------- | ------------------------------------------------------------- |
| start  | `2026-10-14T09:12:03.120Z` | UTC with milliseconds                                         |
| end    | `2026-10-14T09:12:03.480Z` | UTC with milliseconds                                         |
| tool   | `Bash`                     | `Bash`, `Edit`, `Write`, or `apply_patch`                     |
| status | `M`                        | `A`, `M`, or `D`. A type change, such as file to link, is `M` |
| repo   | `/Users/me/repo`           | Top of the git work tree. Empty outside a repo                |
| path   | `/Users/me/repo/x.org`     | Absolute                                                      |
| line   | `412`                      | First changed line after the call. Empty for `D` or unknown   |

## What it records

| Tool                   | Events                                                   | Files                                      | Line                                          |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| Claude Code Edit       | `PostToolUse`                                            | `tool_input.file_path`                     | First hunk of `structuredPatch` in the result |
| Claude Code Write      | `PostToolUse`                                            | `tool_input.file_path`                     | The same. A new file has no hunks: line 1     |
| Claude Code Bash       | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`        | Snapshot difference                        | First hunk of `git diff-tree -p -U0`          |
| Codex Bash             | `PreToolUse`, `PostToolUse`, also after a failed command | Snapshot difference                        | The same                                      |
| Codex `apply_patch`    | `PreToolUse`, `PostToolUse`                              | `*** Add/Update/Delete File`, `Move to`    | From the snapshot. A new file outside it: 1   |
| Both agents, any event | `SessionStart`                                           | None: deletes logs and state after 30 days | None                                          |

A tool that names its files also logs a file outside every repo and a git-ignored file. A failed Edit or Write returns an error string instead of `structuredPatch`, so the hook logs nothing for it.

## Snapshots

Bash names no file, so the hook writes the work tree as a git tree before and after the call and logs the difference. It snapshots the repo of the working directory and each repo in the repo field of the session log. `apply_patch` also snapshots the repos of its files. The snapshot state is in `~/.cache/track-session-changes/<agent>/<session id>/`:

| Path           | Content                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| `index/<hash>` | The git index of one repo, named by the SHA-1 of the repo path                   |
| `objects/`     | The trees and the blobs of the snapshots. The repo objects are an alternate      |
| `pending/<id>` | The repo records and the trees from `PreToolUse`, removed at the end of the call |

For how a snapshot works, how the line comes from the diff, and the measured cost, see [docs/implementation.md](docs/implementation.md).

## Failure behavior

The hook always exits 0 and prints nothing. The command in `settings.json` and in `~/.codex/hooks.json` exits 0 when `node` is not on `PATH`. A failed snapshot skips that repo. A failed patch diff keeps the paths with an empty line.

## Limits

- The first Bash write to a repo the session has not changed yet is not logged. Bash writes to git-ignored files are not logged.
- A Bash snapshot cannot tell which process wrote a file. A file that another process changes during the call is logged as a change of the call. A later phase adds an overlap filter to the `agent-changed-files` package: it drops such a write when another session logged it with a tool path.
- A background Bash call (`run_in_background`) returns before the command ends, so the hook misses its later writes.
- A call that the user denies leaves a pending file. The prune deletes it after one day.

## Test

```bash
node test/check.ts
```
