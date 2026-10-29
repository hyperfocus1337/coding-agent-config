# Testing block-commit-attribution

[`test/check.ts`](../test/check.ts) makes real commits in a temporary repository. It reads the hook command from [`dot_config/git/config`](../../../config) and sets it through `GIT_CONFIG_*` variables, with `GIT_CONFIG_GLOBAL=/dev/null`. `HOME` is a temporary folder that links to this hook folder, so the check runs this source and not the deployed copy. It needs git with config-based hooks, and Node 23.6 or later on `PATH`.

## Run the tests

Run the check from the hook folder:

```sh
node test/check.ts
```

The check prints one `FAIL` line for each failed case, with the assertion message under it. Then it prints `all pass`, or the failure count and exits with code 1.

`just hooks-check` runs this check with the checks of the other hooks:

```sh
just hooks-check
```

## What the cases check

| Group     | Cases                                                                                                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocks    | With `CLAUDECODE=1`: the trailer in `-m`, with the block message on stderr, in `-F <file>`, in a lowercase heredoc on `-F -`, and in a second `-m`. A human co-author. The trailer with `PI_CODING_AGENT`, `OMPCODE`, and `CODEX_THREAD_ID`. |
| Allows    | A plain message, the trailer text inside a line, and the trailer with no agent variable.                                                                                                                                                     |
| No `node` | With only git on `PATH`, an agent commit blocks, and the message names `node 23.6 or later`.                                                                                                                                                 |
