# Implementation notes

How [`index.ts`](../index.ts) turns pi and omp tool events into calls of the shared core. [README.md](../README.md) describes what the extension logs. The snapshot and the log format are in the [hook implementation notes](../../../../../dot_claude/hooks/track-session-changes/docs/implementation.md). Written against pi 1.1.0, omp 18.8.7 on the host, and omp 18.10.3 in the devcontainer, on 2026-10-14.

## The link to core.ts

`symlink_core.ts` makes chezmoi write `core.ts` as a relative link, `../../../../.claude/hooks/track-session-changes/core.ts`. The target is relative, so the same link works in `/Users/<name>` on the host and in `/home/user` in the devcontainer. The omp link, `~/.omp/agent/extensions/track-session-changes`, points at this directory. The kernel resolves the `core.ts` link from the directory that holds it, so the omp path reaches the same file.

pi loads extensions through jiti and omp loads them with bun. Both follow the link at startup, and pi follows it again after `/reload`. After a `/reload`, one edit gave one log line, so the handlers do not register twice.

In the repository, `core.ts` does not exist: there is only `symlink_core.ts`. So the checks map the import to the hook source:

- `scripts/extensions/pi/check.sh` sets `rootDirs` to this directory and the hook directory, so `tsc` finds `./core.ts`.
- `test/check.ts` registers a resolve hook with `module.registerHooks` before it imports `index.ts`.

## pi and omp events

A probe extension logged the events of one bash call and one edit in pi and in omp. Both send `tool_call` before the tool runs and `tool_result` after it, with the same `toolCallId`. Both give `ctx.sessionManager.getSessionId()` and `ctx.cwd`. So one `index.ts` serves both agents.

| Item                     | pi 1.1.0                                       | omp 18.8.7                                                               |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `process.title`          | `pi`                                           | `omp`                                                                    |
| `toolCallId`             | `call_<id>\|fc_<id>`, nested `<parent id>/<n>` | `call_<id>\|fc_<id>` or `call_<id>\|ctc_<id>`                            |
| `edit` input             | `path`, `edits`                                | `input` (a patch), `path`, `paths`                                       |
| `edit` details           | `diff`, `patch`, `firstChangedLine`            | One file: `path`, `op`, `move`, `sourcePath`, `firstChangedLine`, others |
| Multi-file `edit`        | Not possible                                   | `firstChangedLine` and `perFileResults`, one entry per file as above     |
| `write` details          | None                                           | `resolvedPath` only                                                      |
| `ctx.cwd` in `/tmp`      | `/private/tmp/...`                             | `/tmp/...`                                                               |
| `session_start` `reason` | `startup`, `reload`, `new`, `resume`, `fork`   | Not set                                                                  |

The `op` of an omp edit is `create`, `update`, or `delete`. For a move, `path` is the new path and `sourcePath` the old one.

### Agent name

The log directory needs the agent name. `process.title` is `pi` in pi and `omp` in omp, on the host and in the devcontainer. Both agents load the same file, so the file path cannot tell them apart.

### Call ID

`core.ts` takes the call ID as a file name in `pending/` and accepts only `[\w.-]`. A pi call ID holds `|`, and a nested call ID holds `/`. The extension passes the SHA-1 hex of the ID instead.

## Line numbers

| Tool    | Source                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash`  | `beginCall` at `tool_call` and `endCall` at `tool_result`, as for a Claude Code Bash call                                                            |
| `edit`  | `firstChangedLine` of the details. pi has no path in the details, so the input `path` resolves against `ctx.cwd`, with `@` stripped and `~` expanded |
| `write` | `tool_call` reads the old file into memory. `tool_result` reads the new file, and `changedLine` of `core.ts` gives the first line that differs       |

For the before blobs, `tool_call` of an `edit` or a `write` reads each file that `path` or `paths` of the input names into memory, and `recordFiles` of `core.ts` stores the text of each changed file as its before blob. The file is raw from disk, so the CRLF rule of the hook for `originalFile` does not apply.

The write line reads the file after the result, not the `content` input, because omp can format a file after it writes it. A file that did not exist before gets `A` and line 1.

## Cost

A `bash` call runs two snapshots in the agent process: eight `git` processes, and no node start. With the machine at a load average of 10 to 12, one `git` start took 26 ms, and one call (begin and end) took a median of 166 ms in a one-file repo and 208 ms in the chezmoi repo. An `edit` or a `write` starts no process, except in a repo whose attributes name a filter, see the [hook notes](../../../../../dot_claude/hooks/track-session-changes/docs/implementation.md#git-filters). It reads each named file at the call and each changed file at the result, and writes their blobs in-process.

`spawnSync` blocks the event loop of the agent during a snapshot. The interface does not redraw during that time.

## Test

[`test/check.ts`](../test/check.ts) checks `editFiles` with the details of the real pi and omp edits, then runs the handlers with a stub `pi`, a scratch `HOME`, and a scratch repo. It covers a bash call with a pi call ID, a write that creates, updates, and leaves a file as it was, with its blobs, an omp edit, a failed edit, and the before blobs of an omp edit of two files. The last group reads the installed pi package at `PI_PACKAGE`: `firstChangedLine` in `EditToolDetails`, no details for `write`, and the two events.
