# Testing type-check-tsc

[`test/check.ts`](../test/check.ts) runs [`command.ts`](../command.ts) in a real git repository with a stand-in `tsc` on `PATH`. It also checks [`pi.ts`](../pi.ts) and [`omp.ts`](../omp.ts) with stubs, and one case of [`io.ts`](../io.ts).

## Requirements

- **Node 23.6 or later:** it runs `.ts` files without a flag.
- **`git`:** the check makes fixture repositories with it.
- **`sh`:** the stand-in `tsc` is a shell script.

The check does not need a real `tsc`.

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

## Fixtures

The check writes its fixtures to a new folder under the temp folder, and removes the folder at the end. The `format-staged-files` git hook skips the temp folder, so the fixture commits keep the text that the test wrote. The check also removes `CLAUDE_HOOKS_DISABLE`, so a hook that `/toggle-hook` turned off in your agent still runs in the check.

The stand-in `tsc` logs each start to the file in `FAKE_LOG`. When `FAKE_TSC` is `fail`, it prints `tsc error in <folder>` and exits 2. Else it exits 0. The default is `fail`, so exit 0 with no output also means that `tsc` did not start.

## What the cases check

| Group    | Cases                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checks   | A change with no `.ts` file, and a `.ts` file with no `tsconfig.json`, start no `tsc`. A changed `.ts` file with errors blocks with the errors and the `Type check failed` line. An untracked `.tsx`, `.mts`, and `.cts` file each start `tsc`. A path that git quotes (`src/é.ts`) counts. A `tsc` that passes starts once and does not block. A deleted `.ts` file starts no `tsc`. From `src/`, `tsc` runs at the root. |
| Skips    | `stop_hook_active` lets the stop pass. `CLAUDE_HOOKS_DISABLE` that names the hook among others lets the stop pass. A missing `tsc` and a folder outside git are skipped. Before the first commit, the untracked files count, and the stop is blocked.                                                                                                                                                                      |
| `pi.ts`  | A stub `pi` keeps the `agent_end` handler. The handler sends the errors with `triggerTurn` and `deliverAs: "followUp"`. The end of that run passes, and the run after it is checked again. A run that ends with `aborted` or `error` starts nothing.                                                                                                                                                                       |
| `omp.ts` | A stub `omp` keeps the handler. The extension registers only `session_stop`. The handler returns `continue: true` with the errors in `additionalContext`. A stop with `stop_hook_active` passes. A run that ends with `aborted` or `error` starts nothing.                                                                                                                                                                 |
| `io.ts`  | A UTF-8 character whose two bytes arrive in two chunks stays whole.                                                                                                                                                                                                                                                                                                                                                        |
