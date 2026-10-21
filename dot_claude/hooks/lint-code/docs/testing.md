# lint-code tests

[`test/check.ts`](../test/check.ts) is an assert-based self-check of the core and of each adapter.

## Run the tests

Run the check from the hook directory:

```sh
cd dot_claude/hooks/lint-code
node test/check.ts
```

`just hooks-check` runs it too, with the checks of the other hooks. The check prints `all pass`, or a `FAIL` line for each failed case and the number of failures. On a failure, it exits 1.

The fixtures go in a `.lint-hook-check-*` directory under `$HOME`, because the hook skips `/tmp` and `$TMPDIR`. The check deletes the directory at the end. It also removes `AGENT_HOOKS_DISABLE`, so a hook that `/toggle-hook` turned off in the agent that runs the check still runs here.

## Requirements

- **Node 23.6 or later**, which runs `.ts` files without a flag.
- **shellcheck** on `PATH`. Without it, the check skips the `command.ts` cases and prints `SKIP command.ts cases: no shellcheck`. The `pi.ts`, `omp.ts`, and `hooks/register.ts` cases also run shellcheck, and they fail without it.

The other linters are not necessary. The core cases use stub I/O and run no linter.

## What the cases check

### The core, with stub I/O

- **`targets` on a Write or an Edit:** the named file at any age, if it exists.
- **Temporary paths:** a file under `/tmp`, `/var/tmp`, or `$TMPDIR` is skipped, with and without `/private`.
- **`targets` on a Bash call:** each fresh named file, relative to the working directory, once. An old file and a file with no supported extension are not targets. A command that names no source file gives no targets.
- **`lint` by extension:** each extension runs its linter with its flags. `.tfvars` and `.md` run no linter.
- **YAML routing:** a file is Ansible by its entry point name and by its content. Other YAML goes to yamllint.
- **`CLAUDE_LINT_DISABLE`:** keys separated by a comma, and `all`.
- **Missing linter:** the hook skips its file, and the output joins the output of every linter that ran.
- **`AGENT_HOOKS_DISABLE`:** when it names `lint-code`, there are no targets, and the hook touches no file.

### `command.ts`, with the real shellcheck

- **Edit:** exit code 2 and `SC2154` on stderr for a file that shellcheck rejects. Exit code 0 for a clean file.
- **`CLAUDE_LINT_DISABLE=all`:** exit code 0 for a bad file.
- **Bash:** exit code 2 for a file that the command just wrote. Exit code 0 for an old file that the command only read.

### The adapters, with stubs over the real files

- **`pi.ts`:** appends the lint output after the original content and marks the result as an error. It returns nothing for a clean file and for another tool.
- **`omp.ts`:** lints each file of an `edit` of more than one file, the files of an applied `ast_edit`, and the files that `eval` code names. It leaves the one file of an `edit`, a not-applied `ast_edit`, and the calls that `pi.ts` lints alone.
- **`hooks/register.ts`:** adds the lint output as `context` and keeps the text of the result. It passes a clean result and a denied call through unchanged.
