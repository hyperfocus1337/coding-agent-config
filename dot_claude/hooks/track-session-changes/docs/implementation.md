# Implementation notes

How [`core.ts`](../core.ts) takes a snapshot and finds the first changed line, and what it costs. [README.md](../README.md) describes what the hook does for a user. This file is for a person who changes the code. Measured on 2026-10-14 with node 26.10.0, git 2.55.0 and 2.56.0, Claude Code, and Codex CLI 0.160.1.

## Payloads

Probes with a scratch settings file and a disposable session showed these payloads:

| Agent       | Event and tool                                         | Fields the hook reads                                                                    |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Claude Code | `PostToolUse` Edit and Write                           | `tool_input.file_path`, `duration_ms`, `tool_response` with `type` and `structuredPatch` |
| Claude Code | `PreToolUse`, `PostToolUse`, `PostToolUseFailure` Bash | `session_id`, `tool_use_id`, `cwd`                                                       |
| Codex       | `PreToolUse`, `PostToolUse` Bash and `apply_patch`     | `session_id`, `tool_use_id` (`exec-<uuid>`), `cwd`, `tool_input.command`                 |
| Both        | `SessionStart`                                         | None. The event only starts the prune                                                    |

Codex needs trust in the TUI for each new `hooks.json` entry, on the host and in the devcontainer. The probes used `codex exec --dangerously-bypass-hook-trust`. Codex starts a second session for its memories, with its own session ID and `cwd` `~/.codex/memories`. Its `SessionStart` only runs the prune.

The `tool_response` of a Claude Code Edit or Write has the same fields as the `toolUseResult` of the same call in the transcript, but not always the same values. On 2026-10-14, with Claude Code 2.1.300, `tool_response` had the full `originalFile` for files up to 2 MB, while the transcript stored `null` for each file of 44 KB or more. So a transcript does not show what the hook receives. Claude Code sends `cwd` and `file_path` as resolved paths, for example `/private/tmp/x`, not `/tmp/x`.

Codex sends `PostToolUse` also after a command that exits non-zero, with `tool_response` `""`. Codex has no `PostToolUseFailure` event.

## Log place

All agents log to one tree, `~/.local/state/agent-changes/`, and not next to each agent log. In a container, a bind mount puts the same tree on the host disk, so the `agent-changed-files` package reads all logs with one `rg` and no `docker exec`. The snapshot state does not go on the bind mount: the hook rewrites it at each call, so it stays on the local disk of the host or the container.

| Shared directory                                 | Next to each agent log                       |
| ------------------------------------------------ | -------------------------------------------- |
| One path rule in the hook and the package        | One rule per agent, and Codex breaks it      |
| One `rg` over one tree, host and container       | One glob per agent                           |
| The overlap filter reads all agents in one place | It must collect four layouts                 |
| A change of an agent log layout has no effect    | The hook breaks with no error                |
| Needs its own prune                              | Goes away with the old sessions of the agent |

## Design options not taken

| Option                            | Why not                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ |
| Keep `hook.sh` next to TypeScript | Saves 0.06 s per Bash call, but keeps two implementations that can drift |
| A fixed list of repos to snapshot | Each Bash call pays for each repo in the list                            |
| A snapshot with git-ignored files | Slow in repos with `node_modules`, build output, or caches               |

## Line of an Edit or Write

`structuredPatch` holds hunks with three context lines. The first changed line is `newStart` plus the count of context lines (` ` prefix) before the first `+` or `-` line. A pure deletion gives the line that now sits where the deleted lines were. A Write that creates a file has an empty `structuredPatch`, so the line is 1. The start of the call is the end minus `duration_ms`, because Edit and Write have no `PreToolUse` hook.

The repo field of an Edit, a Write, a NotebookEdit, or a pi or omp write comes from `repos.json` too, see [Snapshot](#snapshot), so `rev-parse` runs once per directory per session. On 2026-10-14 this took an Edit hook run from 104 ms to 75 ms on the host.

## Snapshot

A Bash call starts 2 git processes per repo when it changes nothing, and 3 when it modifies a tracked file:

1. `PreToolUse` finds the repos. `rev-parse --show-cdup --path-format=absolute --git-path objects --git-path index` gives the repo top, the object directory, and the repo index in one process. The top is `cwd` plus `--show-cdup`, so it keeps symlinks. `--show-toplevel` would resolve them. `repos.json` keeps the result per directory, so `rev-parse` runs once per directory per session. An entry holds while `<top>/.git` exists and no directory between the directory and the top has a `.git`. A directory outside every repo is not kept, so a later `git init` there counts.
2. `PreToolUse` runs `git add -A` on a copy of the session index of the repo, links the copy to `calls/<id>.<n>.index`, and renames the copy back to the session index.
3. The end event runs `git --no-optional-locks status --porcelain=v2 -z --untracked-files=all --no-renames --ignore-submodules=dirty` against the link: the work tree column gives `M` and `D`, and an untracked file gives `A`.
4. Only when a tracked file changed, the end event runs `diff-files -p -U0 --diff-filter=MT` against the link for the lines.

`GIT_OBJECT_DIRECTORY` points at the session `objects/`, and `GIT_ALTERNATE_OBJECT_DIRECTORIES` at the repo objects, so git reads the repo objects and writes new objects only to the session. The first snapshot starts from a copy of the repo index. Each later one starts from the session index, so git rehashes only the files whose stat changed since the last call. Parallel calls share the index, so each snapshot works on a copy and renames it back.

git writes an index to a new file and renames it, so the link keeps the index of the call while a parallel call replaces the session index. The link also keeps the mtime of the index. git trusts the stat data of an entry only when the entry is older than the index file, so the copy of step 2 gets the mtime of its source too. A copy with a new mtime makes git miss a rewrite of the same size in the same second. On 2026-10-14, 7 runs of 60 random calls through the version before this one and through this one gave the same lines, except one such write: the version before missed it, and this one logged it. Where a link fails, the hook copies the file and keeps its mtime.

`track-bash-changes` ran `update-index --info-only`, which stores no blobs. A diff then has names and blob IDs but no content to diff. This hook stores the blobs, so the diff can read the side before the call. A blob is stored once per content, so only new versions cost disk. After the first snapshot of the chezmoi repo, `objects/` held 276 KB. The first snapshot stores the blob of each dirty and untracked file that git does not ignore. On 2026-10-14 the largest session state was 1.3 MB, so the hook has no size limit.

`PreToolUse` writes the repo records and the link paths to `pending/<tool_use_id>`. The end event reads them, so it needs no `rev-parse`, and a different `cwd` after the call does not change which repos it compares.

## Line of a Bash change

The first `@@ -a,b +c,d @@` after each `diff --git` header of the patch gives the line: `c`, or `c + 1` when `d` is 0 (a pure deletion sits after line `c`). A new file gets line 1, and a deleted file no line. `T` (type change) becomes `M`.

The patch parse reads the path from the `diff --git a/P b/P` header. Both sides of a `diff-files` header hold the same path, so P is the first half. `core.quotePath=false` makes git quote only a path with a control character, a quote, or a backslash. `headerPath` decodes that C quoting.

`--no-ext-diff`, `--no-textconv`, and the explicit prefixes keep user diff settings out of the output. A binary file has no hunk, so its line is empty. A patch larger than 64 MB fails, and the paths stay with an empty line. `--ignore-submodules=dirty` logs a submodule only when its commit moves, and does not look into its work tree.

## Apply_patch

The paths come from the `*** Add File`, `*** Update File`, `*** Delete File`, and `*** Move to` lines. A relative path resolves against `cwd`. A move logs the old path as `D` and the new path as `A`.

`PreToolUse` also snapshots the repos of these paths. At the end, only the named paths are logged, so a write of another process in the same repo does not show as a patch change. The snapshot gives the lines. A named file outside every snapshot repo gets line 1 when it is new, and an empty line otherwise.

## Cost

| Item                                        | Time        |
| ------------------------------------------- | ----------- |
| `node -e 0`                                 | 40 to 45 ms |
| `node hook.ts`, no work, compile cache      | 50 ms       |
| One git process from a shell                | 8 ms        |
| One git process from `spawnSync` in node    | 14 to 22 ms |
| `git add -A` in the chezmoi repo, work only | 9.4 ms      |

On the host, the cost comes from the count of process starts, not from the work of git. A Bash call in the chezmoi repo that changes nothing, Pre and Post, median of 11 runs with a scratch `HOME` and a load average of 12:

| Version                                                                          | Git starts | Time          |
| -------------------------------------------------------------------------------- | ---------- | ------------- |
| `ls-files`, `update-index`, `write-tree` before and after, `rev-parse` each call | 7          | 238 to 290 ms |
| This code                                                                        | 2          | 160 ms        |

The prototype of this code measured 55 ms against 82 ms in the devcontainer, where a node start costs about 20 ms. With 70 Bash calls in a mean session, the change saves about 6 to 9 s per session on the host. Node strips the types of each `.ts` file at each start, which costs about 35 ms. `NODE_COMPILE_CACHE` keeps the compiled code in `~/.cache/node-compile-cache`, so the wiring sets it in the hook command.

## Options measured and not taken

| Option                                                     | Why not                                                                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip read-only commands                                    | The `if` field of a Claude Code hook holds one rule, and a match runs the hook, so it cannot skip. A check in the hook still pays the node start, and a wrong guess loses a file |
| `PostToolUse` with `async: true`                           | No order between the async `PostToolUse` of one call and the `PreToolUse` of the next. The snapshot after the call can hold the writes of the next call                          |
| A node server, with a `curl` client and a fallback to node | A `curl` start costs 15 ms, so it saves about 30 ms per hook run on the host, for one more process on the host and in the container                                              |
| `core.fsmonitor` and `core.untrackedCache`                 | 10 to 20 ms slower in the chezmoi repo, and `core.fsmonitor` starts a daemon per repo                                                                                            |
| `.mjs` in place of `.ts`                                   | About 4 ms per start with `NODE_COMPILE_CACHE`, which the hook command already sets                                                                                              |
| A size limit for the blobs of the first snapshot           | `git add -A` takes no limit, so a limit needs the file list first, which costs the `ls-files` start again. Check the session state sizes again when one grows past a few MB      |

## Test

[`test/check.ts`](../test/check.ts) checks the parsers in-process and runs `hook.ts` as a child process with a scratch `HOME`, around file changes in scratch repos. It covers add, modify, and delete with lines, a pure deletion, parallel and overlapping calls, a failed call, the repo cache, Edit and Write payloads, the touched repos, `apply_patch`, a symlinked `cwd`, a repo without commits, a bad session ID, and the prune of logs, state, pending calls, and call indexes.
