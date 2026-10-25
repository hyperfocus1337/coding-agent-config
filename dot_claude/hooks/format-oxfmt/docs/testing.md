# Testing

[`test/check.ts`](../test/check.ts) runs `command.ts` against real git repositories and the real oxfmt. Then it runs the pi, omp, and mod adapters with stubs over the real files.

## Run the check

Run it from the hook folder:

```sh
node test/check.ts
```

The check prints `all pass`, or one `FAIL` line for each failed case and exits 1. `just hooks-check` runs it with the checks of the other hooks.

## What the check needs

- **git** and **oxfmt** on `PATH`. If one is missing, the hook does nothing, so the check prints `SKIP no <program> on PATH` and exits 0 instead of a false pass.
- **Node 23.6 or later**, which runs a `.ts` file directly.

The fixtures are in a temporary folder under `$HOME`, because the hook skips `/tmp` and `$TMPDIR`. The check deletes the folder at the end.

## Cases

- **The sweep:** the roots that it reaches (a plain subfolder, an embedded repository at depth 1 and 2, a dirty submodule, a worktree, a repository with no `HEAD`, a second repository by absolute path) and what it does not change (`.ts` and `.json` on Bash, ignored Markdown, a symlink back to a root).
- **Named paths:** a named file outside any repository, an ignored file, a relative path, a path that does not exist, and a file in `.prettierignore`.
- **Prose wrap:** a wide table stays padded, and sentence lines stay separate.
- **The amend hint:** after a commit, with a text that names oxfmt, after `git -C <dir> commit`, on `PostToolUseFailure` with that event name, and on the first commit of a repository. No hint without a commit, for an uncommitted file, or when oxfmt changed nothing.
- **A Write or Edit:** the hook formats `.ts`, `.mts`, `.cts`, `.toml`, and `.jsonc`. It does not format `.org`, `.py`, or a temp file, and a file that does not exist gives no output.
- **Config:** a file with no oxfmt config gets the default width of 100. A file below an `.oxfmtrc.json` gets that config.
- **`AGENT_HOOKS_DISABLE`:** a value that names the hook stops the core before its first file or process call.
- **`agent-hook.format-oxfmt.enabled`:** with stub I/O, a `git config` that prints `false` stops the hook before oxfmt, and a `git config` that prints nothing or `true` lets oxfmt run.
- **The adapters:** `pi.ts`, `omp.ts`, and `hooks/register.ts` with stubs over the real files.

The commit-time format is in the [`format-staged-files`](../../../../dot_config/git/hooks/format-staged-files/docs/testing.md) check.

## Settings that the check changes

- **Global git config:** the check sets `GIT_CONFIG_GLOBAL` to an empty file and `GIT_CONFIG_NOSYSTEM`, so a key in your own git config does not change a case.
- **`format-staged-files`:** the check turns this pre-commit hook off with `GIT_CONFIG_*` variables. In an agent session it formats the file before the commit, so the amend hint never comes and the hint cases fail.
- **`AGENT_HOOKS_DISABLE`:** the check removes this variable, so it also runs when `/toggle-hook` turned the hook off in the agent that starts the check.
