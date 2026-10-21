# format-org-tables: testing

[`test/check.ts`](../test/check.ts) checks [`core.ts`](../core.ts) and its adapters. Run it from the hook folder:

```sh
node test/check.ts
```

It prints `all pass`, or one `FAIL` line for each failed case and exits 1.

## What it needs

- **Node 23.6 or later**, which runs a `.ts` file.
- **git** and **Emacs** on `PATH`. Without one of them, the check prints `SKIP no <program> on PATH` and exits 0, because the hook does nothing.

The fixtures are in a temporary folder under `$HOME`, because the hook skips `/tmp` and `$TMPDIR`. The check removes the folder at the end. The check also removes `AGENT_HOOKS_DISABLE`, so the hook runs even when `/toggle-hook` turned it off in the agent that runs the check.

The check turns off the [`format-staged-files`](../../../../dot_config/git/hooks/format-staged-files/README.md) pre-commit hook with `GIT_CONFIG_*` variables. Otherwise that hook aligns the file before the commit, and the amend hint never appears.

## What it checks

The first groups run `command.ts` with the real Emacs and git:

- **A Write or Edit:** the named file, a file that is not `.org`, a path that does not exist, a second pass over an aligned file, no backup files, a file in a temp folder, a `|` line inside a block, a `#+TBLFM` formula, and a link at its raw width.
- **A Bash call:** a relative and two absolute paths in a command, a relative path after an absolute `cd` and after two relative ones, a command that names no `.org` file, a path that does not exist, and a path that the command only read.
- **The amend hint:** after a commit and after `git -C <dir> commit`, and none for a file that the run left as it was or without a commit.
- **`AGENT_HOOKS_DISABLE`:** a value that names the hook stops the core before it reads a file.

The last group runs the adapters with stubs over the real files:

- **`pi.ts`:** aligns the file of an edit, and adds the amend hint to the result.
- **`omp.ts`:** aligns each file of an edit of more than one file and of an applied `ast_edit`, and ignores the calls that `pi.ts` handles.
- **`hooks/register.ts`:** aligns the file and returns the result, adds the amend hint as context, and returns a denied result unchanged.
