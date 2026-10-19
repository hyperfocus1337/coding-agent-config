# format-terraform

Formats the `.tf` and `.tfvars` files that a Write, an Edit, or a Bash call changed, with `terraform fmt`. This README holds the design notes, and the comments in [`core.ts`](core.ts) name the sections below.

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                                    | Loaded by                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash formats after `next` | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash                                                   | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | [`command.ts`](command.ts): the amend hint as `hookSpecificOutput` JSON on stdout                          | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts`               |

The git pre-commit hook [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) also runs `command.ts`, once for each staged file.

## Why this is a separate hook

Prettier has no Terraform parser, so [`format-prettier`](../format-prettier/README.md) cannot do it. The hook copies the design of [`format-org-tables`](../format-org-tables/README.md), which is also one formatter that is not Prettier, selected by extension. [`hook-alternatives.md`](../../../docs/research/hooks/hook-alternatives.md) found no official hook that does this job.

## Triggers

The hook runs after each Write, Edit, and Bash call, also after a call that failed, because a failed Bash command can still have written a file. Anything that is not an existing `.tf` or `.tfvars` file is a clean skip.

- **Write and Edit:** the call names one file. The hook formats that file.
- **Bash:** the hook takes each `.tf` and `.tfvars` path that the command text names, absolute or relative to the session cwd. A path counts only when its mtime is at most 120 s old, so a file that the command only read stays as it is. `format-org-tables` uses the same rule, and its README gives the reasons. A command that writes a file without naming it (a script, `terraform init`, a `find -exec`) is missed.

A path under `/tmp`, `/var/tmp`, or `$TMPDIR` is skipped, because the scratchpad of the agent is there.

## One run for each file

The hook starts `terraform fmt -no-color <file>` once for each file. One run with all files does not work: when one file does not parse, `terraform fmt` exits 2 and does not format the files after it. A run takes about 15 ms, so one run for each file costs little.

`terraform fmt` prints the name of a file only when it changed the file. The hook uses that output for the amend hint and reads no file text. The printed name is not the path that the hook gave, so the hook only checks whether the output is empty.

## Write and commit in one command

A Bash call can write a file and commit it. Formatting the file after the call fixes the file, not the commit. The hook then tells the model to amend: `context` in the mod, an appended text block in pi, and `hookSpecificOutput.additionalContext` in Codex. The hint names a file only when both conditions are true:

- `terraform fmt` changed the file in this run.
- The last commit holds the file: `git diff-tree --no-commit-id --name-only -r --root HEAD`.

In an agent session, `format-staged-files` formats the staged file before the commit, so the hint appears only when that hook skipped the file. `format-org-tables` explains this in "Write and commit in one command".

## Never blocks

The hook never blocks a call and never marks a result as an error. A missing `terraform`, a file that does not parse, or a run past 10 s leaves the file as it is.

| Adapter      | On a failure                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Mod          | Claude Code skips a hook that throws, and the result stands.                                      |
| `pi.ts`      | The handler catches the error and returns nothing.                                                |
| `command.ts` | Node exits 1, which Codex shows as a failed hook and does not block. A missing terraform exits 0. |

The hook drops the stderr of `terraform fmt`, so a parse error does not show as hook output. `lint-all-languages` does not check Terraform, so nothing reports the parse error to the model. `terraform validate` or tflint can do that, but both check a whole module folder and `validate` needs `terraform init`.

## Requirements

- **terraform** on `PATH`. Tested with Terraform 1.16.5. Without it, the hook does nothing.
- **git**, for the amend hint.
- **Node 23.6 or later** for `command.ts`, which Codex and `format-staged-files` run. With no `node`, the Codex entry exits 0, and the `SessionStart` check of Codex shows a warning. The mod and `pi.ts` need no `node` of their own.

## Tests

```sh
node test/check.ts
```

[`test/check.ts`](test/check.ts) runs `command.ts` with the real terraform and git, in a fixture under `$HOME`, because the hook skips `/tmp` and `$TMPDIR`:

- **A Write or Edit:** a `.tf` and a `.tfvars` file, a file that is not Terraform, a path that does not exist, a file that does not parse, and a file in a temp folder.
- **A Bash call:** a relative and two absolute paths in a command, a command that names no Terraform file, a path that does not exist, and a path the command only read.
- **The amend hint:** after a commit, and none for a file that the run left alone or without a commit.
- **The adapters:** `pi.ts` and `hooks/register.ts` with stubs over the real files.

The check turns off `format-staged-files` with `GIT_CONFIG_*` variables, and skips with a message when git or terraform is missing.

## Files

| File                                                             | Role                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| [`core.ts`](core.ts)                                             | Finds the files and runs `terraform fmt`. No Node imports.    |
| [`io.ts`](io.ts)                                                 | The file and process functions of the core under Node         |
| [`command.ts`](command.ts)                                       | The command hook for Codex and `format-staged-files`          |
| [`pi.ts`](pi.ts)                                                 | The pi and omp extension                                      |
| [`hooks/register.ts`](hooks/register.ts), `hooks/hooks.json`     | The Claude Code mod                                           |
| [`dot_claude-plugin/plugin.json`](dot_claude-plugin/plugin.json) | The plugin manifest, deployed as `.claude-plugin/plugin.json` |
