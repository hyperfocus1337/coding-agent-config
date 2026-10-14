# Implementation notes

How [`core.ts`](../core.ts) takes a snapshot and finds the first changed line, and what it costs. [README.md](../README.md) describes what the hook does for a user. This file is for a person who changes the code. Measured on 2026-10-14 with node 26.10.0, git 2.55.0, Claude Code, and Codex CLI 0.160.1.

## Payloads

Probes with a scratch settings file and a disposable session showed these payloads:

| Agent       | Event and tool                                         | Fields the hook reads                                                                    |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Claude Code | `PostToolUse` Edit and Write                           | `tool_input.file_path`, `duration_ms`, `tool_response` with `type` and `structuredPatch` |
| Claude Code | `PreToolUse`, `PostToolUse`, `PostToolUseFailure` Bash | `session_id`, `tool_use_id`, `cwd`                                                       |
| Codex       | `PreToolUse`, `PostToolUse` Bash and `apply_patch`     | `session_id`, `tool_use_id` (`exec-<uuid>`), `cwd`, `tool_input.command`                 |
| Both        | `SessionStart`                                         | None. The event only starts the prune                                                    |

The `tool_response` of a Claude Code Edit or Write is equal (`==` in jq) to the `toolUseResult` of the same call in the transcript. Claude Code sends `cwd` and `file_path` as resolved paths, for example `/private/tmp/x`, not `/tmp/x`. Codex sends `PostToolUse` also after a command that exits non-zero, with `tool_response` `""`. Codex has no `PostToolUseFailure` event.

## Line of an Edit or Write

`structuredPatch` holds hunks with three context lines. The first changed line is `newStart` plus the count of context lines (` ` prefix) before the first `+` or `-` line. A pure deletion gives the line that now sits where the deleted lines were. A Write that creates a file has an empty `structuredPatch`, so the line is 1. The start of the call is the end minus `duration_ms`, because Edit and Write have no `PreToolUse` hook.

## Snapshot

One snapshot of one repo takes one `git rev-parse` and three git commands:

1. `rev-parse --show-cdup --path-format=absolute --git-path objects --git-path index` gives the repo top, the object directory, and the repo index in one process. The top is `cwd` plus `--show-cdup`, so it keeps symlinks. `--show-toplevel` would resolve them.
2. `ls-files -z -m -o -d --exclude-standard` lists the modified, untracked, and deleted files against the session index of this repo.
3. `update-index -z --add --remove --replace --stdin` hashes these files and stores their blobs.
4. `write-tree --missing-ok` writes the tree.

`GIT_OBJECT_DIRECTORY` points at the session `objects/`, and `GIT_ALTERNATE_OBJECT_DIRECTORIES` at the repo objects, so git reads the repo objects and writes new objects only to the session. The first snapshot starts from a copy of the repo index. Each later one starts from the session index, so git rehashes only the files whose stat changed since the last snapshot. Parallel calls share the index, so each snapshot works on a copy and renames it back.

`track-bash-changes` ran `update-index --info-only`, which stores no blobs. A tree diff then has names and blob IDs but no content to diff. This hook stores the blobs, so the diff can read both sides. A blob is stored once per content, so only new versions cost disk. After the first snapshot of the chezmoi repo, `objects/` held 276 KB.

`PreToolUse` writes the repo records and the tree IDs to `pending/<tool_use_id>`. The end event reads them, so it needs no `rev-parse`, and a different `cwd` after the call does not change which repos it compares.

## Line of a Bash change

The end event runs two diffs between the trees, only when the tree IDs differ:

- `diff-tree -r -z --no-renames --name-status` gives the status and the path of each file. `T` (type change) becomes `M`.
- `diff-tree -r --no-renames -p -U0` gives the hunks. The first `@@ -a,b +c,d @@` after each `diff --git` header gives the line: `c`, or `c + 1` when `d` is 0 (a pure deletion sits after line `c`).

The patch parse reads the path from the `diff --git a/P b/P` header. With `--no-renames`, both sides hold the same path, so P is the first half. `core.quotePath=false` makes git quote only a path with a control character, a quote, or a backslash. `headerPath` decodes that C quoting.

`--no-ext-diff`, `--no-textconv`, and the explicit prefixes keep user diff settings out of the output. A binary file has no hunk, so its line is empty, or 1 when it is new. A patch larger than 64 MB fails, and the paths stay with an empty line.

## Apply_patch

The paths come from the `*** Add File`, `*** Update File`, `*** Delete File`, and `*** Move to` lines. A relative path resolves against `cwd`. A move logs the old path as `D` and the new path as `A`.

`PreToolUse` also snapshots the repos of these paths. At the end, only the named paths are logged, so a write of another process in the same repo does not show as a patch change. The snapshot gives the lines. A named file outside every snapshot repo gets line 1 when it is new, and an empty line otherwise.

## Cost

| Item                                                          | Time                                            |
| ------------------------------------------------------------- | ----------------------------------------------- |
| `node -e 0`                                                   | 45 ms                                           |
| `node hook.ts`, no work, no compile cache                     | 85 ms                                           |
| `node hook.ts`, no work, compile cache                        | 50 ms                                           |
| One git process (`rev-parse`)                                 | 15 ms                                           |
| `ls-files -m -o -d` in the chezmoi repo                       | 25 to 45 ms                                     |
| One Bash call in the chezmoi repo, Pre and Post, median of 10 | 230 ms, against 182 ms for `track-bash-changes` |

Node strips the types of each `.ts` file at each start, which costs about 35 ms. `NODE_COMPILE_CACHE` keeps the compiled code in `~/.cache/node-compile-cache`, so the wiring sets it in the hook command. The machine was under load during the measurements, so single runs varied by up to 100 ms.

## Test

[`test/check.ts`](../test/check.ts) checks the parsers in-process and runs `hook.ts` as a child process with a scratch `HOME`, around file changes in scratch repos. It covers add, modify, and delete with lines, a pure deletion, parallel calls, a failed call, Edit and Write payloads, the touched repos, `apply_patch`, a symlinked `cwd`, a repo without commits, a bad session ID, and the prune.
