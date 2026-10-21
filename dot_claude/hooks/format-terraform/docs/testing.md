# Testing format-terraform

[`test/check.ts`](../test/check.ts) checks the core and each adapter of the hook. Run it from the hook folder:

```sh
node test/check.ts
```

It prints `all pass`, or one `FAIL` line for each failed case and exits 1.

## What the test needs

- **Node 23.6 or later**, which runs a `.ts` file.
- **terraform** and **git** on `PATH`. Without one of them, the hook does nothing, so the check prints `SKIP no <program> on PATH` and exits 0.

The fixture goes in a folder under `$HOME`, because the hook skips `/tmp` and `$TMPDIR`. The check removes `CLAUDE_HOOKS_DISABLE`, so it runs also when `/toggle-hook` turned the hook off. It turns off `format-staged-files` with `GIT_CONFIG_*` variables, because that hook formats the file before the commit and then nothing is left to amend.

## What the cases check

The cases run `command.ts` with the real `terraform` and git:

- **A Write or Edit:** a `.tf` and a `.tfvars` file, a file that is not Terraform, a path that does not exist, a file that does not parse, and a file in a temp folder.
- **A Bash call:** a relative and two absolute paths in a command, a command that names no Terraform file, a path that does not exist, and a path the command only read.
- **The amend hint:** after a commit and after `git -C <dir> commit`, and none for a file that the run left alone or without a commit.
- **`CLAUDE_HOOKS_DISABLE`:** a value that names the hook stops the core before it reads a file.

Then the cases run the adapters with stubs over the real files:

- **`pi.ts`:** formats the file of an edit, and appends the amend hint to the result.
- **`omp.ts`:** formats each file of an edit of more than one file and of an applied `ast_edit`, and leaves the calls of `pi.ts` alone.
- **`hooks/register.ts`:** formats the file and passes the result, adds the amend hint as context, and passes a deny through.
