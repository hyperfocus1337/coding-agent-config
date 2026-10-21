# Testing

`test/check.ts` checks the core and both adapters. It needs Node 23.6 or later, which runs a `.ts` file without a flag, and git. Run it from the hook folder:

```sh
node test/check.ts
```

`just hooks-check` runs it with the tests of the other hooks.

## Cases

- **`core.ts`:**
  - A name flips a hook, `all` flips all hooks, and no argument lists them with their formatters and the scope that turns each off.
  - A value set at launch can use commas and hold names that are not hooks, and the command keeps those names.
  - A guard name or an unknown name changes nothing. A hook that the repository turns off stays off without `--repo`, and a formatter name needs `--repo`.
  - `--repo` flips one name, and `--repo all` flips the hooks and leaves the formatter keys.
  - `PARTS` holds the same keys as `FORMATTERS` in `format-code/core.ts`. The status text names only the hooks that are off, with `(repo)` for the repository scope.
- **`command`, with the real git:** in a temporary repository, with `GIT_CONFIG_GLOBAL` set to a temporary file and `GIT_CONFIG_NOSYSTEM=1`, so your own git config stays out.
  - `--repo` writes `false` and then removes the key. `--repo all` turns all hooks off and on.
  - A `false` in the global config gets a `true` in the repository.
  - `--repo` outside a repository prints `Not changed:`. A value that is not a boolean keeps the name on.
- **The mod:** `hooks/register.ts` with a stub `on` and `$`, whose `$.process.run` runs git in the test repository. It registers the command, shows a value set at launch in the status line, sets the variable and the status line, writes git config for `--repo`, and prints `Not changed:` when the write is refused.
- **`pi.ts`:** with a stub `pi` and a `ctx.cwd` in the test repository. It sets `process.env` and the status line, writes git config for `--repo`, shows the repository state at session start, and completes `--repo`, the hook names, the formatter names after `--repo`, and `all`.

## Tests in other hooks

The test of each of the 7 hooks has a case that sets `AGENT_HOOKS_DISABLE` and checks that the hook does nothing, and a case where `agent-hook.<hook>.enabled false` in git config does the same. The test of `format-code` also turns off one formatter. The test of `format-staged-files` checks that a commit is still formatted with the variable set, and is not formatted when the repository turns the formatter off.
