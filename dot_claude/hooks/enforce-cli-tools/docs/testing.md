# enforce-cli-tools testing

[`test/check.ts`](../test/check.ts) is the self-check for the matcher in [`core.ts`](../core.ts) and for its three adapters. It needs Node 23.6 or later on `PATH`, which runs `.ts` files without a flag.

## Run the check

Run it from the hook directory:

```sh
node test/check.ts
```

It prints one `FAIL` line for each failed case, then `all pass` or the failure count. It exits non-zero on a failure. `just hooks-check` runs it with the checks of the other hooks.

## Matcher cases

A banned tool in command position must block:

- The plain call.
- Wrappers and their arguments: `sudo npm ci`, `CI=1 npm run build`, `timeout 30 npm ci`.
- A full path: `/usr/local/bin/npm i`.
- Each way a second command can hide in one line: after `&&`, on the next line, in a subshell, in a `{ ...; }` group, and in `$(...)` or backticks.

A mention in an argument or in text must pass: `rg npm`, `git commit -m 'switch to npm'`, `npmrc-check`. A separator in a quoted string must pass too. A quoted-delimiter heredoc body is text, and an unquoted one can run `$(...)`.

## Guards

These cases cover faults that would break enforcement with no error:

- The shipped `rules` file parses to two rules. A lost last line fails this case.
- A multi-word replacement (`npx` to `pnpm dlx`) comes back whole.
- An allowlisted tool passes, and the other rules stay enforced.

## Adapters

Each adapter runs against a scratch repo whose `.agent-allow-cli-tools` file allows `yarn`:

- **`command.ts`:** runs as a child process. For `npm i`, it exits 2 with the message and the suggestion on stderr, and nothing on stdout. For `yarn add x`, it exits 0 with no output.
- **`pi.ts`:** runs with a stub `pi`. For `npm i`, it blocks, and the message names the allow file and gives the command that adds it to the exclude file of the repo. It passes `yarn add x`, and a call to a tool other than bash.
- **`hooks/register.ts`:** runs with a stub `$` over the real files. It denies `npm i` and passes `yarn add x`.
