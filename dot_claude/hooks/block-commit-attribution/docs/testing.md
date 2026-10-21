# Testing block-commit-attribution

[`test/check.ts`](../test/check.ts) checks the matcher in [`core.ts`](../core.ts) and both adapters. It needs Node 23.6 or later on `PATH`, which runs `.ts` files without a flag.

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

| Group               | Cases                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blocks              | The trailer in each form that the model writes: a heredoc body, a second `-m`, a `printf` substitution, `git -C repo commit --amend` in lowercase, and a human co-author. `violation()` returns the block message. |
| Allows              | No trailer (`git commit -m 'fix: x'`), or no `commit` as a whole word: `git log --grep`, `rg ... committed.txt`, and `git commit-tree`. `violation()` returns `undefined`.                                         |
| `pi.ts`             | A stub `pi` keeps the `tool_call` handler. The handler returns `{ block: true, reason }` for the trailer, and nothing for a plain commit or for a tool that is not `bash`.                                         |
| `hooks/register.ts` | A stub `on` keeps the matcher and the hook. The matcher is `{ tool: "Bash" }`. The hook returns `{ deny }` for the trailer, and passes a plain commit to `next`.                                                   |
