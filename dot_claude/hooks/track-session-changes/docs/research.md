# Research

What [`core.ts`](../core.ts) and each adapter cost, and the options that were measured and not taken. [implementation.md](implementation.md) gives how the code works. Unless a section gives another date, the measurements are from 2026-10-14, with node 26.10.0, git 2.55.0 and 2.56.0, Claude Code, and Codex CLI 0.160.1.

## Cost

### Command hook

| Item                                        | Time        |
| ------------------------------------------- | ----------- |
| `node -e 0`                                 | 40 to 45 ms |
| `node hook.ts`, no work, compile cache      | 50 ms       |
| One git process from a shell                | 8 ms        |
| One git process from `spawnSync` in node    | 14 to 22 ms |
| `git add -A` in the chezmoi repo, work only | 9.4 ms      |

On the host, the cost comes from the count of process starts, not from the work of git. A Bash call in the chezmoi repo that changes nothing, Pre and Post, median of 11 runs with a scratch `HOME` and a load average of 12:

| Snapshot                                                                         | Git starts | Time          |
| -------------------------------------------------------------------------------- | ---------- | ------------- |
| `ls-files`, `update-index`, `write-tree` before and after, `rev-parse` each call | 7          | 238 to 290 ms |
| Session index with `git add -A`, `repos.json`                                    | 2          | 160 ms        |

In the devcontainer, where a node start costs about 20 ms, a prototype of the session index snapshot measured 55 ms against 82 ms. With 70 Bash calls in a mean session, the session index saves about 6 to 9 s per session on the host.

Node strips the types of each `.ts` file at each start, which costs about 35 ms. `NODE_COMPILE_CACHE` keeps the compiled code in `~/.cache/node-compile-cache`, so the wiring sets it in the hook command.

### Mod

Measured live on 2026-10-19 in the devcontainer with Claude Code 2.1.303, from the times of the `$` calls in the debug log, in a repo of 1,002 files. The times of `node hook.ts` are from spike 3, in the same repo:

| Step                                         | Time        | `node hook.ts`, before the mod |
| -------------------------------------------- | ----------- | ------------------------------ |
| Start of a Bash call                         | 17 to 28 ms | 30 to 41 ms                    |
| End of a Bash call                           | 10 to 13 ms | 27 to 57 ms                    |
| End of a Write or an Edit                    | 5 to 6 ms   | 29 to 37 ms                    |
| Prune at `session.start`, 44 session folders | 114 ms      | One node start                 |

A `$` call costs about 1 ms, and a `$.process.run` 2 to 5 ms. The mod starts no node, which is most of the cost of the command hook.

In spike 3, the snapshot as one `sh -c` script took 6 to 10 ms against 14 to 30 ms for one `$.process.run` per step. The core keeps one `Io` function per step, so a test can replace each one.

### pi and omp

`pi.ts` runs the core in the agent process with `spawn` from `node:child_process`, so a snapshot does not block the event loop. Before the move, the extension used `spawnSync`, and the interface did not redraw during a snapshot. Then one `bash` call took a median of 166 ms in a one-file repo and 208 ms in the chezmoi repo, at a load average of 10 to 12 on 2026-10-14.

## Blobs on a bind mount

The session `objects/` is on the bind mount of the log tree, see [Blob place](implementation.md#blob-place). On 2026-10-15 in the devcontainer, with git 2.55.0:

| Write                                | Local disk | Bind mount |
| ------------------------------------ | ---------- | ---------- |
| `git add -A` of 50 new files of 8 KB | 20–23 ms   | 43–45 ms   |
| `git add -A` with 1 changed file     | 3–5 ms     | 5–6 ms     |

So the bind mount adds about 2 to 3 ms to a Bash call that changes a file, and about 0.5 ms per blob to the first snapshot of a repo.

## Options measured and not taken

| Option                                                     | Why not                                                                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip read-only commands                                    | The `if` field of a Claude Code hook holds one rule, and a match runs the hook, so it cannot skip. A check in the hook still pays the node start, and a wrong guess loses a file |
| `PostToolUse` with `async: true`                           | No order between the async `PostToolUse` of one call and the `PreToolUse` of the next. The snapshot after the call can hold the writes of the next call                          |
| A node server, with a `curl` client and a fallback to node | A `curl` start costs 15 ms, so it saves about 30 ms per hook run on the host, for one more process on the host and in the container                                              |
| `core.fsmonitor` and `core.untrackedCache`                 | 10 to 20 ms slower in the chezmoi repo, and `core.fsmonitor` starts a daemon per repo                                                                                            |
| `.mjs` in place of `.ts`                                   | About 4 ms per start with `NODE_COMPILE_CACHE`, which the hook command already sets                                                                                              |
| A size limit for the blobs of the first snapshot           | `git add -A` takes no limit, so a limit needs the file list first, which costs the `ls-files` start again. Check the session state sizes again when one grows past a few MB      |
