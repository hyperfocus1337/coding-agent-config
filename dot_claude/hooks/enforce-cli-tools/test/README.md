# Tests

## check.ts

Self-check for the matcher in `../core.ts` and for its three adapters. Run it from the hook directory:

```bash
node test/check.ts
```

It prints one `FAIL` line for each failed case, then `all pass` or the failure count, and exits non-zero on a failure. `just hooks-check` runs it with the checks of the other hooks.

**Matcher cases.** A banned tool in command position must block: the plain call, wrappers and their arguments (`sudo npm ci`, `CI=1 npm run build`, `timeout 30 npm ci`), a full path (`/usr/local/bin/npm i`), and each way a second command can hide in one line: after `&&`, on the next line, in a subshell, in a `{ ...; }` group, and in `$(...)` or backticks. A mention in an argument or in text must pass (`rg npm`, `git commit -m 'switch to npm'`, `npmrc-check`), and so must a separator in a quoted string. A quoted-delimiter heredoc body is text, and an unquoted one can run `$(...)`.

**Guards.** These cases cover faults that would break enforcement with no error:

- The shipped `rules` file parses to two rules. A lost last line fails this case.
- A multi-word replacement (`npx` to `pnpm dlx`) comes back whole.
- An allowlisted tool passes, and the other rules stay enforced.

**Adapters.**

- `command.ts` runs as a child process: it exits 2 with the message on stderr for `npm i`, and the message gives the command that adds the allow file to the exclude file of the repo, and it exits 0 with no output for a tool that the repo's `.agent-allow-cli-tools` file allows.
- `pi.ts` runs with a stub `pi`.
- `hooks/register.ts` runs with a stub `$` over the real files.
