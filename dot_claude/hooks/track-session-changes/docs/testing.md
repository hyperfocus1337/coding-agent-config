# Testing track-session-changes

[`test/check.ts`](../test/check.ts) checks the parsers of [`core.ts`](../core.ts) in-process and runs `command.ts` as a child process with a scratch `HOME`, around file changes in scratch repos. It also runs the mod, `pi.ts`, and `omp.ts` with stubs over the real files.

## Requirements

- **Node 23.6 or later:** runs `.ts` files without a flag.
- **git:** the cases make scratch repos, and the hook snapshots them.
- **bash:** the cases make file changes through `bash -c`.

## Run the tests

Run the check from the hook folder:

```sh
node test/check.ts
```

The check prints one `FAIL` line for each failed case, with the assertion message under it. Then it prints `<n> checks pass`, or `<n> checks, some failed` and exits with code 1.

`just hooks-check` runs this check with the checks of the other hooks:

```sh
just hooks-check
```

## Settings

- **`PI_PACKAGE`:** the path of the installed pi package. The last case reads the pi types there, and it is skipped when the variable is not set. `just hooks-check` sets it.
- **`TRACK_HOOK=<path>`:** runs the `command.ts` cases against another command hook. On 2026-10-19 all 56 checks passed against the `hook.ts` from before the mod.

## What the cases check

| Group             | Cases                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parsers           | The line of an Edit, a Write, a pi write, and a `-U0` hunk, the diff header, the `apply_patch` paths, the CRLF line endings of `originalFile`, and the rebuild of an Edit: an equal text before the hunk, tabs, an occurrence that reaches past its hunk, `replaceAll`, an empty `newString`, and a patch that does not fit                                                         |
| Hook runs         | Add, modify, and delete with lines, a pure deletion, parallel and overlapping calls, a failed call, the repo cache, Edit and Write payloads, the touched repos, `apply_patch`, a symlinked `cwd`, a repo without commits, a bad session ID, and the prune of logs, state, pending calls, and call indexes                                                                           |
| Blobs             | The before and after blobs of a Bash call, a file that git cannot read, an Edit with and without `originalFile`, a CRLF file and a file with mixed line endings, a Write that creates in and outside a repo, a NotebookEdit and `apply_patch`, the blob of git in a repo whose attributes convert CRLF, and the prune of the session objects                                        |
| The mod           | A stub `$` over the real files: a Bash call, a denied call, a call that throws, an Edit, a failed Edit, a NotebookEdit, and the prune at `session.start`                                                                                                                                                                                                                            |
| `pi.ts`, `omp.ts` | A stub pi: the edit parsers with the details of real pi and omp edits, a bash call with a pi call ID, a write that creates, updates, and leaves a file as it was, an omp edit, a failed edit, the before blobs of an omp edit of two files, and the git snapshot around an omp `eval` and a `write` to `xd://resolve`. The last case reads the installed pi package at `PI_PACKAGE` |
