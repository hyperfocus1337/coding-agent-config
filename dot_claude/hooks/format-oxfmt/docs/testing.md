# Testing

[`test/check.ts`](../test/check.ts) runs `command.ts` against a real git repository and the real oxfmt. Then it runs the pi and mod adapters with stubs over the real files. The sweep and the amend hint are in `shared.ts`, which [`format-prettier/test/check.ts`](../../format-prettier/test/check.ts) covers in full, so this check covers what is different for oxfmt.

## Run the check

Run it from the hook folder:

```sh
node test/check.ts
```

The check prints `all pass`, or one `FAIL` line for each failed case and exits 1. `just hooks-check` runs it with the checks of the other hooks.

## What the check needs

- **git** and **oxfmt** on `PATH`. If one is missing, the check prints `SKIP no <program> on PATH` after the copy check and exits 0.
- **Node 23.6 or later**, which runs a `.ts` file directly.

The fixtures are in a temporary folder under `$HOME`, because the hook skips `/tmp` and `$TMPDIR`. The check deletes the folder at the end.

## Cases

- **The copies:** `shared.ts` and `omp.ts` are the same as in `format-prettier`.
- **Off by default:** with no key, an edit leaves the file as it is.
- **On:** with `agent-hook.format-oxfmt.enabled true` in the repository, the hook formats an edited Markdown, `.toml`, and `.jsonc` file, leaves a `.py` file, sweeps Markdown after a Bash call, and gives an amend hint that names oxfmt.
- **Config:** a file with no oxfmt config gets a width of 80 from the bundled config. A file below an `.oxfmtrc.json` gets that config.
- **`AGENT_HOOKS_DISABLE`:** a value that names the hook leaves the file as it is.
- **The adapters:** `pi.ts` and `hooks/register.ts` with stubs over the real files. The mod gets the bundled config from `$.plugin.root`.

The switch from the side of Prettier is in the `format-prettier` check: with the key set, Prettier does not start. The commit-time format is in the [`format-staged-files`](../../../../dot_config/git/hooks/format-staged-files/docs/testing.md) check: with the key set, oxfmt formats a staged `.toml` file.

## Settings that the check changes

- **Global git config:** the check sets `GIT_CONFIG_GLOBAL` to an empty file and `GIT_CONFIG_NOSYSTEM`, so a key in your own git config does not change a case.
- **`format-staged-files`:** the check turns this pre-commit hook off with `GIT_CONFIG_*` variables, so the amend hint case has something to amend.
- **`AGENT_HOOKS_DISABLE`:** the check removes this variable, so it also runs when `/toggle-hook` turned the hook off in the agent that starts the check.
