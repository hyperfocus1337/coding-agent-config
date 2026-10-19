# track-session-changes

A hook that logs each file a session changes, with the tool, the call window, the first changed line, and the git blobs of the file before and after the call. The [`session-files`](../../skills/session-files/) skill and the `agent-changed-files` package read the log.

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                            | Loaded by                                                                                          |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts): a mod on `tool.call` and `session.start` | `CLAUDE_CODE_PLUGIN_DIRS` in `dot_claude/settings.json.tmpl`                                       |
| pi and omp  | [`pi.ts`](pi.ts): `tool_call`, `tool_result`, and `session_start`                  | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | [`command.ts`](command.ts): a command hook, `node command.ts codex`                | `dot_codex/modify_hooks.json`                                                                      |

## Log

Each session writes one log: `~/.local/state/agent-changes/<agent>/<session id>.tsv`, with `claude`, `codex`, `pi`, or `omp` as the agent. Subagent calls carry the session ID of the main session, so they go to the same log. In pi and omp, the session ID is `ctx.sessionManager.getSessionId()`, which is also part of the name of the session file. One line per file per call, tab-separated:

| Field  | Example                    | Note                                                          |
| ------ | -------------------------- | ------------------------------------------------------------- |
| start  | `2026-10-14T09:12:03.120Z` | UTC with milliseconds                                         |
| end    | `2026-10-14T09:12:03.480Z` | UTC with milliseconds                                         |
| tool   | `Bash`                     | The tool name of the agent, such as `Edit` or pi's `edit`     |
| status | `M`                        | `A`, `M`, or `D`. A type change, such as file to link, is `M` |
| repo   | `/Users/me/repo`           | Top of the git work tree. Empty outside a repo                |
| path   | `/Users/me/repo/x.org`     | Absolute                                                      |
| line   | `412`                      | First changed line after the call. Empty for `D` or unknown   |
| before | `3b18e512dbc8…`            | Git blob ID of the file before the call. Empty for `A`        |
| after  | `9daeafb9864c…`            | Git blob ID of the file after the call. Empty for `D`         |

A line with 7 fields has no `before` and `after`. A blob ID is empty also when the hook cannot know it, see [Blobs](#blobs). The `agent-changed-files` package of the chezmoi repo reads the blobs to find the changes of one session in a file.

## What it records

| Agent and tool           | Events                                                   | Files                                                    | Line                                                                             |
| ------------------------ | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Claude Code Edit, Write  | `tool.call`, after `next`                                | `file_path` of the input                                 | First hunk of `structuredPatch` in the result. A new file has no hunks: line 1   |
| Claude Code NotebookEdit | `tool.call`, after `next`                                | `notebook_path` of the input                             | First line that differs between `original_file` and `updated_file` of the result |
| Claude Code Bash         | `tool.call`, before and after `next`                     | Snapshot difference                                      | First hunk of `git diff-files -p -U0`                                            |
| Codex Bash               | `PreToolUse`, `PostToolUse`, also after a failed command | Snapshot difference                                      | The same                                                                         |
| Codex `apply_patch`      | `PreToolUse`, `PostToolUse`                              | `*** Add/Update/Delete File`, `Move to`                  | From the snapshot. A new file outside it: 1                                      |
| pi and omp `bash`        | `tool_call`, `tool_result`                               | Snapshot difference                                      | The same as Bash                                                                 |
| pi and omp `edit`        | `tool_call`, `tool_result`                               | pi: the input `path`. omp: each file of the tool details | `firstChangedLine` of the details. An omp file it creates: 1                     |
| pi and omp `write`       | `tool_call`, `tool_result`                               | The input `path`                                         | The old file, read at the call, against the file after it                        |
| Each agent               | Session start                                            | None: deletes logs and state after 30 days               | None                                                                             |

A failed Bash call logs its changes, because a command that fails can still write files. A tool that names its files also logs a file outside every repo and a git-ignored file. A failed Edit, Write, NotebookEdit, pi `edit`, or pi `write` logs nothing. In Claude Code, a call that another hook denies logs nothing. A pi `write` that leaves the file as it was logs nothing.

An omp edit can change several files, delete a file, or move one. A delete logs `D`, and a move logs the old path as `D` and the new path as `A`. Other tools that write files, for example an omp `ast_edit` or a tool of another extension, are not logged.

## Blobs

The hook stores the blobs of each logged file in `~/.local/state/agent-changes/<agent>/<session id>/objects/`, a git object directory beside the log. In the devcontainer, the bind mount of the log tree puts these blobs on the host disk too. The hook reads the objects of the repo as an alternate, so a blob that the repo holds is not copied. `git hash-object -w` writes each blob, so a blob gets the filters of the repo attributes, as with `git add`.

| Tool                         | Before blob                                                                                | After blob       |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| Claude Code Edit and Write   | `originalFile` of the result, with the line endings of the file. Else a rebuild of an Edit | The file on disk |
| Claude Code NotebookEdit     | `original_file` of the result                                                              | The file on disk |
| pi and omp `edit`, `write`   | The files that the input names, read at the tool call                                      | The file on disk |
| Bash, `apply_patch`          | The index entry of the file in the snapshot of the call                                    | The file on disk |
| A file that the call made    | None                                                                                       | As above         |
| A file that the call deleted | As above                                                                                   | None             |

A before blob is missing for a file with mixed line endings, for an Edit whose rebuild fails, for an omp edit that names its files only inside its patch, and for an `apply_patch` file outside every snapshot repo. An after blob is missing for a file that git cannot read.

## Snapshots

Bash names no file, so the hook stores the work tree in a git index before the call, and after the call logs the files that differ from that index. It snapshots the repo of the working directory and each repo in the repo field of the session log. `apply_patch` also snapshots the repos of its files. The blobs of a snapshot go to the session `objects/`, see [Blobs](#blobs). The snapshot state is in `~/.cache/track-session-changes/<agent>/<session id>/`:

| Path                        | Content                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `index/<hash>`              | The git index of one repo, named by the SHA-1 of the repo path                                                         |
| `repos.json`                | The repo of each directory that a call looked up                                                                       |
| `calls/<id>.<n>.<ms>.index` | A link to the index of repo n at the start of the call, made at time `<ms>`, removed at the end of the call            |
| `pending/<id>`              | Codex only: the start time and the repo records from `PreToolUse`, removed at the end of the call                      |
| `blobs.git`                 | An empty bare repo. git writes no object outside a repo, so the blobs of a file outside every repo go through this one |

The mod and `pi.ts` keep the snapshot of a call in memory from the start of the call to its end. `command.ts` runs once for each event, so it keeps the snapshot in `pending/`.

For how a snapshot works, how the line comes from the diff, and the measured cost, see [docs/implementation.md](docs/implementation.md).

## Failure behavior

The hook never blocks or changes a tool call. Each step of the mod and of `pi.ts` catches its own errors and drops them, and `command.ts` always exits 0 and prints nothing. The Codex entries exit 0 when `node` is not on `PATH`, and the `SessionStart` check of Codex then gives a warning. A failed snapshot skips that repo. A failed patch diff keeps the paths with an empty line.

## Limits

- A Bash call snapshots only the repo of its working directory and the repos in the session log. So a Bash write to another repo is not logged until a tool that names its files changes that repo, or a call runs with its working directory there. Bash writes to git-ignored files are not logged.
- A Bash snapshot cannot tell which process wrote a file. A file that another process changes during the call is logged as a change of the call. The overlap filter of the `agent-changed-files` package drops such a write when another session logged it with a tool path.
- A background Bash call (`run_in_background`) returns before the command ends, so the hook misses its later writes.
- In Claude Code, the mod reads a file through `$.fs`, which refuses a file over 4 MiB, and `$.process.run` keeps 4 MiB of output. So a session log over 4 MiB gives no touched repos, an Edit of a file over 4 MiB gets no before blob, and a patch over 4 MiB gives the paths with an empty line. `command.ts` and `pi.ts` read up to 64 MiB of output.
- A Codex call that a hook denies leaves a pending file and its index links. A pi or omp call that gets no `tool_result` leaves its index links. The prune deletes them after one day.
- The paths in an omp log keep the logical working directory, for example `/tmp/x`. pi logs the resolved path, `/private/tmp/x` on macOS.
- The prune deletes the `objects/` of a session when both its log and its state are gone, so after 30 days of no use.
- A blob ID is the SHA-1 of git. A repo with SHA-256 object names gets IDs that it does not hold.

## Dependencies

The hook needs `git`. `command.ts` needs Node 23.6 or later, which runs `.ts` files without a flag. Codex runs a hook only after you trust its entry. After a change of an entry, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## Tests

`node test/check.ts` checks the parsers in-process, runs `command.ts` as a child process with a scratch `HOME` around file changes in scratch repos, and runs the mod and `pi.ts` with stubs over the real files. `TRACK_HOOK=<path>` runs the `command.ts` cases against another command hook. `just hooks-check` runs it.

## Files

| File                                                | Deployed to `~/.claude/hooks/track-session-changes/` | Role                                                                    |
| --------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `core.ts`                                           | Yes                                                  | Snapshots, blobs, the log, and the prune, over an `Io` from the adapter |
| `hooks/register.ts`                                 | Yes                                                  | Claude Code mod, with the `Io` over `$`                                 |
| `hooks/hooks.json`, `dot_claude-plugin/plugin.json` | Yes, the second as `.claude-plugin/plugin.json`      | Module list and plugin manifest                                         |
| `pi.ts`                                             | Yes                                                  | pi and omp extension                                                    |
| `command.ts`                                        | Yes                                                  | Codex command hook                                                      |
| `io.ts`                                             | Yes                                                  | The `Io` under Node, for `pi.ts` and `command.ts`                       |
| `README.md`, `docs/`, `test/`                       | No                                                   | Kept in the repo by `.chezmoiignore`                                    |
