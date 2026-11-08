# Testing type-check-code

[`test/check.ts`](../test/check.ts) runs [`command.ts`](../command.ts) in a real git repository with a stand-in `tsc` and `pyrefly` on `PATH`. It also checks [`pi.ts`](../pi.ts) and [`omp.ts`](../omp.ts) with stubs, and one case of [`io.ts`](../io.ts).

## Requirements

- **Node 23.6 or later:** it runs `.ts` files without a flag.
- **`git`:** the check makes fixture repositories with it.
- **`sh`:** the stand-in checkers are shell scripts.

The check does not need a real `tsc` or `pyrefly`.

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

The check writes its fixtures to a new folder under the temp folder, and removes the folder at the end. The `format-staged-files` git hook skips the temp folder, so the fixture commits keep the text that the test wrote. The check also removes `AGENT_HOOKS_DISABLE`, so a hook that `/toggle-hook` turned off in your agent still runs in the check.

The stand-in checkers log each start to the file in `FAKE_LOG`. `FAKE_TSC` and `FAKE_PYREFLY` set what they do:

| Value     | `tsc`                                   | `pyrefly`                                   |
| --------- | --------------------------------------- | ------------------------------------------- |
| `fail`    | Prints `tsc error in <folder>`, exits 2 | Prints `pyrefly error in <folder>`, exits 1 |
| `slow`    | Waits 1 s, logs `tsc end`, then fails   | Not used                                    |
| `missing` | Not used                                | Prints two missing-import errors, exits 1   |
| `nomatch` | Not used                                | Prints `No Python files matched`, exits 1   |
| `pass`    | Exits 0                                 | Exits 0                                     |

The default of both is `fail`, so exit 0 with no output also means that no checker started.

## What the cases check

| Group     | Cases                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tsc`     | No change, or a change with no `.ts` or `.py` file, starts no checker. A `.ts` file with no `tsconfig.json` starts no `tsc`. A changed `.ts` file blocks with the errors and the advice, and starts `tsc` only. An untracked `.tsx`, `.mts`, `.cts`, and `.d.ts` file each start `tsc`. A path that git quotes counts. A `tsc` that passes does not block. A deleted `.ts` file starts no `tsc`. From `src/`, `tsc` runs at the root.      |
| `pyrefly` | A changed `.py` file blocks with the errors and the advice, and starts `pyrefly` only. Missing-import errors stay whole. An untracked `.py` file and a path that git quotes count. A `pyrefly` that passes, or that matches no files, does not block. A deleted `.py` file starts no `pyrefly`. From `src/`, `pyrefly` runs at the root.                                                                                                   |
| Both      | Both checkers report, `tsc` first. A checker that passes leaves the errors of the other. With a slow `tsc`, `pyrefly` starts before `tsc` ends, so the checkers run in parallel.                                                                                                                                                                                                                                                           |
| Skips     | `stop_hook_active` lets the stop pass. `AGENT_HOOKS_DISABLE` that names the hook lets the stop pass, and `type-check-code.tsc` skips only `tsc`. `agent-hook.type-check-code.enabled false` lets the stop pass, `agent-hook.type-check-code.pyrefly false` skips only `pyrefly`, and a value that is not a boolean keeps it on. Missing checkers and a folder outside git are skipped. Before the first commit, the untracked files count. |
| `pi.ts`   | A stub Pi keeps the `agent_before_settle` and `agent_settled` handlers. Findings preserve earlier entries, have the custom type `type-check-code`, and request one continuation. Correction boundaries skip checking. Settlement resets the guard. Aborted or failed runs start nothing.                                                                                                                                                   |
| `omp.ts`  | A stub `omp` keeps the handler. The extension registers only `session_stop`. The handler returns `continue: true` with the errors in `additionalContext`. A stop with `stop_hook_active` passes. A run that ends with `aborted` or `error` starts nothing.                                                                                                                                                                                 |
| `io.ts`   | A UTF-8 character whose two bytes arrive in two chunks stays whole.                                                                                                                                                                                                                                                                                                                                                                        |
