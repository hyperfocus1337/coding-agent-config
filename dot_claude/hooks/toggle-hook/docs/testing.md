# Testing

`test/check.ts` checks the core and both adapters. It needs Node 23.6 or later, which runs a `.ts` file without a flag. Run it from the hook folder:

```sh
node test/check.ts
```

`just hooks-check` runs it with the tests of the other hooks.

## Cases

- **`core.ts`:** a name flips a hook, `all` flips all hooks, and no argument lists them. A value set at launch can use commas and hold names that are not hooks, and the command keeps those names. A guard name or an unknown name changes nothing, and the status text names only the hooks that are off.
- **The mod:** `hooks/register.ts` with a stub `on` and `$`. It registers the command, shows a value set at launch in the status line, sets the variable and the status line, and prints `Not changed:` when the write is refused.
- **`pi.ts`:** with a stub `pi`. It sets `process.env` and the status line, and completes the hook names and `all`.

## Tests in other hooks

The test of each of the 7 hooks has a case that sets `AGENT_HOOKS_DISABLE` and checks that the hook does nothing. The test of `format-staged-files` checks that a commit is still formatted.
