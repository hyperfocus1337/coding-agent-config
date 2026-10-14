# track-session-changes

Logs each file that a pi or omp session changes, with the tool, the call window, and the first changed line. It is the in-process side of the [`track-session-changes`](../../../../dot_claude/hooks/track-session-changes/README.md) hook: `core.ts` here is a link to the hook's `core.ts`, so pi, omp, Claude Code, and Codex write the same log with the same code. The [`session-files`](../../../../dot_claude/skills/session-files/) skill and the `agent-changed-files` package read the log.

omp runs the same extension: chezmoi links `~/.omp/agent/extensions/track-session-changes` to this directory. omp reads only its own extension root, so the extension loads once in each agent.

## Log

Each session writes `~/.local/state/agent-changes/<agent>/<session id>.tsv`, with `pi` or `omp` as the agent. The session ID is `ctx.sessionManager.getSessionId()`, which is also part of the name of the session file, so the two join by ID. The fields are the same as in the [hook log](../../../../dot_claude/hooks/track-session-changes/README.md#log). The tool field holds the pi tool name: `bash`, `edit`, or `write`.

## What it records

| Tool    | Events                     | Files                                                    | Line                                                         |
| ------- | -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `bash`  | `tool_call`, `tool_result` | Git snapshot difference of the touched repos             | First hunk of `git diff-tree -p -U0`                         |
| `edit`  | `tool_call`, `tool_result` | pi: the input `path`. omp: each file of the tool details | `firstChangedLine` of the details. An omp file it creates: 1 |
| `write` | `tool_call`, `tool_result` | The input `path`                                         | The old file, read at the call, against the file after it    |
| None    | `session_start`            | None: deletes logs and state of all agents after 30 days | None                                                         |

An omp edit can change several files, delete a file, or move one. A delete logs `D`, and a move logs the old path as `D` and the new path as `A`. A failed edit or write logs nothing. A failed bash call logs its changes. A write that leaves the file as it was logs nothing.

Other tools that write files, for example an omp `ast_edit` or a tool of another extension, are not logged.

## Failure behavior

Each handler catches its own errors and drops them, so the extension never blocks or changes a tool call. A failed snapshot skips that repo.

## Limits

The [limits of the hook](../../../../dot_claude/hooks/track-session-changes/README.md#limits) apply to `bash`. Also:

- The paths in an omp log keep the logical working directory, for example `/tmp/x`. pi logs the resolved path, `/private/tmp/x` on macOS.
- A snapshot runs `git` in the agent process, so a `bash` call waits for it. See [docs/implementation.md](docs/implementation.md#cost).

## Check

Run `just pi-check`, or `node dot_pi/agent/extensions/track-session-changes/test/check.ts`. After `just chezmoi`, `/reload` in a running pi or a new omp session loads an edit.
