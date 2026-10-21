# Testing type-check-pyrefly

[`test/check.ts`](../test/check.ts) is the self-check of [`core.ts`](../core.ts) and its adapters. Run it from the hook directory:

```sh
node test/check.ts
```

`just hooks-check` also runs it. The check prints `all pass`, or one `FAIL` line for each failed case and exits 1.

## What the tests need

- `node` 23.6 or later, which runs `.ts` files without a flag.
- `git` on `PATH`.

The tests need no real pyrefly. A stand-in `pyrefly` script on `PATH` passes, fails, or matches no files, as `FAKE_PYREFLY` says, and it logs each start to `FAKE_LOG`.

## Fixtures

- The fixture repositories are in a folder under the temp directory, so the global `format-staged-files` hook skips the fixture commits.
- The check removes `CLAUDE_HOOKS_DISABLE` first, so it also runs when you turned the hook off with `/toggle-hook`.

## Cases

Each group of cases checks one part of the hook:

- **Checks:** `command.ts` on a `Stop` payload. A changed `.py` file with errors blocks, and so do an untracked `.py` file and a path that git quotes. A pyrefly that passes or matches no files does not block. A deleted `.py` file, a `.ts` file, or no change starts no pyrefly. pyrefly runs from the root, not from the session folder.
- **Skips:** `stop_hook_active` (the loop guard), `CLAUDE_HOOKS_DISABLE` that names the hook, a missing pyrefly, and a folder outside git let the stop pass. Before the first commit, the untracked files count.
- **`pi.ts`, with a stub:** it sends the errors and starts a run, the end of that run passes, and the next run is checked again. A stopped or failed run starts nothing.
- **`omp.ts`, with a stub:** it registers `session_stop` only and continues with the errors as context. The stop after a continuation passes, and a stopped or failed run starts nothing.
- **`io.ts`:** a character split across two output chunks stays whole.
