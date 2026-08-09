# Tests

## test.sh

Smoke test for the `violation` matcher in `../hook.sh`, the function that decides whether a command is running a banned CLI tool.

Run it:

```bash
bash test.sh
```

It sources `../hook.sh` and calls `violation` directly. The hook defines the matcher at the top, then a sourcing guard (`[[ "${BASH_SOURCE[0]}" == "${0}" ]] || return 0`) stops before the hook body, so sourcing loads only the functions without reading stdin or parsing a payload.

Each case asserts one command string. Command-position hits must block, covering the plain invocation, wrappers and their arguments (`sudo npm ci`, `CI=1 npm run build`, `timeout 30 npm ci`), a full path (`/usr/local/bin/npm i`), and every way a second command can hide in one line: after `&&`, on the next line, in a subshell, in a `{ ...; }` group, and inside `$(...)` or backticks even as an argument. Mentions in an argument or in text must pass (`rg npm`, `git commit -m 'switch to npm'`, `npmrc-check`), as must a separator inside a quoted string (`git commit -m 'fix; npm bump'`).

The rest guard things that broke once and would break silently again. One case asserts the shipped `rules` file parsed to two rules, which is what catches a missing trailing newline dropping the last one. Two check the reported mapping, one of them by appending a multi-word rule (`npx` → `pnpm dlx`) to the rule arrays to prove the replacement is not truncated at the first word. Two more set the `allowlist` array directly to confirm an exempt tool passes while the remaining rules stay enforced.

Prints `ok`/`FAIL` per case and exits non-zero if any case fails. Nothing runs it automatically today, so run it by hand after touching the tokeniser or the rules format.

The matcher is the only part under test; the payload parsing, override loading and JSON output in the hook body are exercised by piping a payload into `hook.sh` by hand. Add a case here whenever you tune the tokeniser or the `rules` file grows a new shape.
