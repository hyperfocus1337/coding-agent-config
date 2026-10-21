# track-session-changes

A hook that logs each file that an agent session changes, with the tool, the call window, the first changed line, and the git blobs of the file before and after the call. The `session-files` skill and the `agent-changed-files` package of the chezmoi repo read the log to find the changes of one session.

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                                                              | Loaded by                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Claude Code | [`hooks/register.ts`](hooks/register.ts): a mod on `tool.call` and `session.start`                                                   | `CLAUDE_CODE_PLUGIN_DIRS` in `dot_claude/settings.json.tmpl` |
| pi          | [`pi.ts`](pi.ts): `tool_call`, `tool_result`, and `session_start`                                                                    | `extensions` in `dot_pi/agent/modify_settings.json`          |
| omp         | [`omp.ts`](omp.ts): the `track` of `pi.ts` with the omp tools, which adds a git snapshot around `eval` and a write to `xd://resolve` | `extensions` in `dot_omp/private_agent/private_config.yml`   |
| Codex       | [`command.ts`](command.ts): a command hook, `node command.ts codex`                                                                  | `dot_codex/modify_hooks.json`                                |

## What it records

### Tools and events

| Agent and tool                              | Events                                                   | Files                                                    | Line                                                                             |
| ------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Claude Code Edit, Write                     | `tool.call`, after `next`                                | `file_path` of the input                                 | First hunk of `structuredPatch` in the result. A new file has no hunks: line 1   |
| Claude Code NotebookEdit                    | `tool.call`, after `next`                                | `notebook_path` of the input                             | First line that differs between `original_file` and `updated_file` of the result |
| Claude Code Bash                            | `tool.call`, before and after `next`                     | Snapshot difference                                      | First hunk of `git diff-files -p -U0`                                            |
| Codex Bash                                  | `PreToolUse`, `PostToolUse`, also after a failed command | Snapshot difference                                      | The same                                                                         |
| Codex `apply_patch`                         | `PreToolUse`, `PostToolUse`                              | `*** Add/Update/Delete File`, `Move to`                  | From the snapshot. A new file outside it: 1                                      |
| pi and omp `bash`                           | `tool_call`, `tool_result`                               | Snapshot difference                                      | The same as Bash                                                                 |
| omp `eval`, and a `write` to `xd://resolve` | `tool_call`, `tool_result`                               | Snapshot difference                                      | The same as Bash                                                                 |
| pi and omp `edit`                           | `tool_call`, `tool_result`                               | pi: the input `path`. omp: each file of the tool details | `firstChangedLine` of the details. An omp file it creates: 1                     |
| pi and omp `write`                          | `tool_call`, `tool_result`                               | The input `path`                                         | The old file, read at the call, against the file after it                        |
| Each agent                                  | Session start                                            | None: deletes logs and state after 30 days               | None                                                                             |

A snapshot difference is the set of files that differ between the work tree after the call and a git index of the work tree before it, see [Snapshots](#snapshots).

### Failed and denied calls

- **Bash:** a failed call logs its changes, because a command that fails can still write files.
- **Edit, Write, NotebookEdit, pi `edit`, and pi `write`:** a failed call logs nothing.
- **Denied calls:** in Claude Code, a call that another hook denies logs nothing.
- **Unchanged files:** a pi `write` that leaves the file as it was logs nothing.

A tool that names its files also logs a file outside every repo and a git-ignored file.

### omp edits and other tools

An omp edit can change several files, delete a file, or move one. A delete logs `D`, and a move logs the old path as `D` and the new path as `A`. An omp `ast_edit` changes files only when a `write` to `xd://resolve` applies its preview, and the snapshot of that write logs them.

The hook does not log other tools that write files, for example a tool of another extension.

### Limits

- A Bash call snapshots only the repo of its working directory and the repos in the session log. So a Bash write to another repo is not logged until a tool that names its files changes that repo, or a call runs with its working directory there. Bash writes to git-ignored files are not logged.
- A Bash snapshot cannot tell which process wrote a file. A file that another process changes during the call is logged as a change of the call. The overlap filter of the `agent-changed-files` package drops such a write when another session logged it with a tool path.
- A background Bash call (`run_in_background`) returns before the command ends, so the hook misses its later writes.
- In Claude Code, the mod reads a file through `$.fs`, which refuses a file over 4 MiB, and `$.process.run` keeps 4 MiB of output. So a session log over 4 MiB gives no touched repos, an Edit of a file over 4 MiB gets no before blob, and a patch over 4 MiB gives the paths with an empty line. `command.ts` and `pi.ts` read up to 64 MiB of output.
- A Codex call that a hook denies leaves a pending file and its index links. A pi or omp call that gets no `tool_result` leaves its index links. The prune deletes them after one day.
- The paths in an omp log keep the logical working directory, for example `/tmp/x`. pi logs the resolved path, `/private/tmp/x` on macOS.
- The prune deletes the `objects/` of a session when both its log and its state are gone, so after 30 days of no use.
- A blob ID is the SHA-1 of git. A repo with SHA-256 object names gets IDs that it does not hold.

## Requirements

- **git:** each adapter runs `git`.
- **Node 23.6 or later:** `command.ts` needs it, because this version runs `.ts` files without a flag.
- **Codex trust:** Codex runs a hook only after you trust its entry. After a change of an entry, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## How it works

A tool that names its files, such as Edit or pi `edit`, gives the path in its input, so the hook needs no snapshot. For Bash and the other tools that name no file, the hook compares the work tree before and after the call. In the devcontainer, the mod adds 17 to 28 ms at the start of a Bash call, 10 to 13 ms at its end, and 5 to 6 ms after an Edit or a Write, see [docs/research.md](docs/research.md).

### Snapshots

Bash names no file, so the hook stores the work tree in a git index before the call. After the call, it logs the files that differ from that index. It snapshots the repo of the working directory and each repo in the repo field of the session log, and `apply_patch` also snapshots the repos of its files.

The blobs of a snapshot go to the session `objects/`, see [Blobs](#blobs). The snapshot state is in `~/.cache/track-session-changes/<agent>/<session id>/`:

| Path                        | Content                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `index/<hash>`              | The git index of one repo, named by the SHA-1 of the repo path                                                         |
| `repos.json`                | The repo of each directory that a call looked up                                                                       |
| `calls/<id>.<n>.<ms>.index` | A link to the index of repo n at the start of the call, made at time `<ms>`, removed at the end of the call            |
| `pending/<id>`              | Codex only: the start time and the repo records from `PreToolUse`, removed at the end of the call                      |
| `blobs.git`                 | An empty bare repo. git writes no object outside a repo, so the blobs of a file outside every repo go through this one |

The mod and `pi.ts` keep the snapshot of a call in memory from the start of the call to its end. `command.ts` runs once for each event, so it keeps the snapshot in `pending/`.

For how a snapshot works and how the line comes from the diff, see [docs/implementation.md](docs/implementation.md).

### Blobs

The hook stores the blobs of each logged file in `~/.local/state/agent-changes/<agent>/<session id>/objects/`, a git object directory beside the log. In the devcontainer, the bind mount of the log tree puts these blobs on the host disk too. The hook reads the objects of the repo as an alternate, so it does not copy a blob that the repo holds.

`git hash-object -w` writes each blob, so a blob gets the filters of the repo attributes, as with `git add`.

| Tool                         | Before blob                                                                                | After blob       |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| Claude Code Edit and Write   | `originalFile` of the result, with the line endings of the file. Else a rebuild of an Edit | The file on disk |
| Claude Code NotebookEdit     | `original_file` of the result                                                              | The file on disk |
| pi and omp `edit`, `write`   | The files that the input names, read at the tool call                                      | The file on disk |
| Bash, `apply_patch`          | The index entry of the file in the snapshot of the call                                    | The file on disk |
| A file that the call made    | None                                                                                       | As above         |
| A file that the call deleted | As above                                                                                   | None             |

A before blob is missing in these cases:

- A file with mixed line endings.
- An Edit whose rebuild fails.
- An omp edit that names its files only inside its patch.
- An `apply_patch` file outside every snapshot repo.

An after blob is missing for a file that git cannot read.

## What the model sees

Nothing. The hook never blocks or changes a tool call, and it sends no output to the model. `command.ts` always exits 0 and prints nothing.

## What you see

The hook shows no message in the transcript or the terminal. Its only output is the session log.

### Log

Each session writes one log: `~/.local/state/agent-changes/<agent>/<session id>.tsv`, with `claude`, `codex`, `pi`, or `omp` as the agent. Subagent calls carry the session ID of the main session, so they go to the same log. In pi and omp, the session ID is `ctx.sessionManager.getSessionId()`, which is also part of the name of the session file.

The log has one line per file per call, with tab-separated fields:

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

A line with 7 fields has no `before` and `after`. A blob ID is empty also when the hook cannot know it, see [Blobs](#blobs). The `agent-changed-files` package reads the blobs to find the changes of one session in a file.

## Settings

The hook has no variables or config files, and it does not read `AGENT_HOOKS_DISABLE`. To turn it off for one agent, remove its entry from the file in the "Loaded by" column of the adapter table.

## Failure behavior

The hook fails open: no failure blocks or changes a tool call, and you see no message.

- **Mod and `pi.ts`:** each step catches its own errors and drops them.
- **`command.ts`:** always exits 0 and prints nothing.
- **No `node` on `PATH`:** the Codex entries exit 0, and the `SessionStart` check of Codex gives a warning.
- **Failed snapshot:** the hook skips that repo.
- **Failed patch diff:** the hook keeps the paths, with an empty line.

## Testing

`node test/check.ts` checks the parsers, `command.ts`, the mod, `pi.ts`, and `omp.ts`, see [docs/testing.md](docs/testing.md).
