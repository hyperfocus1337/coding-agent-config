# Testing format-code

[`test/check.ts`](../test/check.ts) checks the core, each formatter, and each adapter of the hook. Run it from the hook folder:

```sh
node test/check.ts
```

It prints `all pass`, or one `FAIL` line for each failed case and exits 1. `just hooks-check` runs it with the checks of the other hooks.

## What the test needs

- **Node 23.6 or later**, which runs a `.ts` file.
- **git** on `PATH`. Without it, the check prints `SKIP no git on PATH` and exits 0.
- **oxfmt**, **Emacs**, **terraform**, **shfmt**, and **ruff** on `PATH`. A formatter that is missing does nothing, so the check prints `SKIP` for its cases instead of a false pass. The cases of terraform fmt, shfmt, ruff, and the adapters need all three of those programs.

[`test/harness.ts`](../test/harness.ts) holds the parts that the integration cases share:

- **Fixtures:** a temporary folder under `$HOME`, because the hook skips `/tmp` and `$TMPDIR`. The check deletes the folder at the end.
- **Global git config:** the check sets `GIT_CONFIG_GLOBAL` to an empty file and `GIT_CONFIG_NOSYSTEM`, so a key in your own git config does not change a case.
- **`format-staged-files`:** the check turns this pre-commit hook off with `GIT_CONFIG_*` variables. In an agent session it formats the file before the commit, so the amend hint never comes and the hint cases fail.
- **`AGENT_HOOKS_DISABLE`:** the check removes this variable, so it also runs when `/toggle-hook` turned the hook off in the agent that starts the check.

## Unit cases

`test/check.ts` first imports the unit cases. They need no formatter on `PATH`, and a failed assert stops the run:

- [`test/core.ts`](../test/core.ts), the core with a stub `Io`: the formatter for each extension, `format-code` and `format-code.<key>` in `AGENT_HOOKS_DISABLE`, the `enabled` key and a formatter key in git config, an Org file with no table, the Markdown-only sweep of oxfmt, and the paths: one oxfmt run for all files, each path once with no dot segments, and the dot segments removed before the scratch-file filter.
- [`test/shfmt.ts`](../test/shfmt.ts): an `.editorconfig` in a folder above gives no printer flags. No `.editorconfig`, or a folder with that name, gives `-i 2 -ci`.
- [`test/ruff.ts`](../test/ruff.ts): one run for each file, in its folder, with `--force-exclude`.
- [`test/sweep.ts`](../test/sweep.ts), `sweep.ts` with a stub `Io`: the start time rounded down to the second, the 120 s window without a start time, a named file that git does not list, the roots of absolute paths only, an untracked repository and a submodule as roots, and the last commit for a command that commits.

## Integration cases

These cases run `command.ts` with the real formatters and git.

### oxfmt

[`test/oxfmt.ts`](../test/oxfmt.ts) runs these cases:

- **The sweep:** the roots that it reaches (a plain subfolder, an embedded repository at depth 1 and 2, a dirty submodule, a worktree, a repository with no `HEAD`, a second repository by absolute path) and what it does not change (`.ts` and `.json` on Bash, ignored Markdown, a symlink back to a root).
- **Named paths:** a named file outside any repository, an ignored file, a relative path, a parent-relative path in a batch, a path that does not exist, and a file in `.prettierignore`.
- **Prose wrap:** a wide table stays padded, and sentence lines stay separate.
- **The amend hint:** after a commit, with a text that names oxfmt, after `git -C <dir> commit`, on `PostToolUseFailure` with that event name, and on the first commit of a repository. No hint without a commit, for an uncommitted file, or when oxfmt changed nothing.
- **A Write or Edit:** `.ts`, `.mts`, `.cts`, `.toml`, and `.jsonc`, a file that no formatter takes, a temp file, a file next to `TMPDIR` with the same name prefix, and a file that does not exist.
- **Config:** a file with no oxfmt config gets the default width of 100. A file below an `.oxfmtrc.json` gets that config.

### Org tables

[`test/org-tables.ts`](../test/org-tables.ts) runs these cases:

- **A Write or Edit:** the named file, a file that no formatter takes, a path that does not exist, a second pass over an aligned file, no backup files, a file in a temp folder, a `|` line inside a block, a `#+TBLFM` formula, and a link at its raw width.
- **A Bash call:** a relative and two absolute paths in a command, a file after an absolute `cd` and after two relative ones, a changed file that the command does not name, a command that names no `.org` file, a path that does not exist, and a path that the command only read.
- **The amend hint:** after a commit and after `git -C <dir> commit`, and none for a file that the run left as it was or without a commit.

### terraform fmt, shfmt, and ruff format

`test/check.ts` runs these cases:

- **terraform fmt:** a `.tf` and a `.tfvars` file, a file that no formatter takes, a path that does not exist, a file that does not parse, and a file in a temp folder. On a Bash call: a relative and two absolute paths, a changed file that the command does not name, and a path the command only read. The amend hint after a commit and after `git -C <dir> commit`, and none for a file that the run left alone or without a commit.
- **shfmt:** a 2-space indent and an indented `case` branch when no `.editorconfig` is above the fixture, the indent of an `.editorconfig` in the repo, a `.bash` path in a command, a file that does not parse, and the amend hint that names shfmt. An `.editorconfig` above `$HOME` changes the first case, so the check prints `SKIP` for it.
- **ruff format:** a `.py` file that a Write names, a `.pyi` path in a command, a file that does not parse, a file that the `exclude` list of a `ruff.toml` holds, the amend hint that names ruff format, and no hint when ruff changed nothing.
- **git config:** `agent-hook.format-code.shfmt false` in the repo keeps a shell file as it is and still formats a `.tf` file, a value that is not a boolean keeps shfmt on, and `agent-hook.format-code.enabled no` keeps a `.tf` file as it is.

## Adapter cases

The last cases in `test/check.ts` run the adapters with stubs over the real files, with Terraform fixtures:

- **`pi.ts`:** formats the file of an edit and of a parent-relative edit path, leaves other tools alone, appends the amend hint to the result, and leaves a file that changed before the bash call.
- **`omp.ts`:** formats each file of an edit of more than one file and of an applied `ast_edit`, leaves the calls of `pi.ts` alone, and leaves a file that changed before an `eval` call.
- **`hooks/register.ts`:** formats the file and passes the result, adds the amend hint as context, leaves a file that changed before the Bash call, and passes a deny through.

The commit-time format is in the [`format-staged-files`](../../../../dot_config/git/hooks/format-staged-files/docs/testing.md) check.
