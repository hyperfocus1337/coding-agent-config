# format-terraform

Formats the `.tf` and `.tfvars` files that a Write, an Edit, or a Bash call changed, with `terraform fmt`. It exists because Prettier has no Terraform parser, so [`format-prettier`](../format-prettier/README.md) cannot format these files.

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                                                                                                 | Loaded by                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash formats after `next`                                                              | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                    |
| pi          | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash                                                                                                                | `extensions` in `dot_pi/agent/modify_settings.json`                                  |
| omp         | [`pi.ts`](pi.ts) as in pi, and [`omp.ts`](omp.ts): `tool_result` on an omp edit of more than one file, an `ast_edit` that a write to `xd://resolve` applies, and `eval` | `extensions` in `dot_omp/private_agent/private_config.yml`                           |
| Codex       | [`command.ts`](command.ts): the amend hint as `hookSpecificOutput` JSON on stdout                                                                                       | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts` |

The git pre-commit hook [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) also runs `command.ts`, once for each commit. It names all staged files in `tool_input.file_paths`, a field that no agent payload has.

## What it checks

The hook runs after each Write, Edit, and Bash call. It runs also after a call that failed, because a failed Bash command can still write a file. It formats these files:

- **Write and Edit:** the file that the call names.
- **Bash:** each `.tf` and `.tfvars` path that the command text names, absolute or relative to the session cwd. A path counts only when its mtime is at most 120 s old, so a file that the command only read stays as it is. `format-org-tables` uses the same rule, and its README gives the reasons.

The hook skips these paths, with no output:

- A path that is not an existing `.tf` or `.tfvars` file.
- A path under `/tmp`, `/var/tmp`, or `$TMPDIR`, because the scratchpad of the agent is there.

The hook misses a Bash command that writes a Terraform file but does not name it, for example a script, `terraform init`, or a `find -exec`. A relative path resolves against the session cwd only, not against a folder that a `cd` in the command moves to.

## Requirements

- **terraform** on `PATH`. Tested with Terraform 1.16.5 and 1.16.6. Without it, the hook does nothing.
- **git**, for the amend hint.
- **Node 23.6 or later** for `command.ts`, which Codex and `format-staged-files` run. The mod, `pi.ts`, and `omp.ts` run in the process of the agent and need no `node` of their own.

```sh
brew install hashicorp/tap/terraform
```

## How it works

1. The hook stops when `CLAUDE_HOOKS_DISABLE` names `format-terraform`.
2. It finds the files to format, as "What it checks" tells.
3. It runs `terraform fmt -no-color <file>` once for each file, in the folder of the file, with a limit of 10 s.
4. When the call is a Bash command that commits, it asks git whether the last commit holds each file that `terraform fmt` changed.
5. It sends the amend hint for each file that the last commit holds.

`terraform fmt` prints the name of a file only when it changed the file. The hook uses that output to find the changed files, and reads no file text.

## What the model sees

The hook formats the file in place and usually sends nothing to the model. Its only output is the amend hint. `command.ts` exits 0, also when it prints the hint.

### Write and commit in one command

A Bash call can write a file and commit it. Formatting the file after the call fixes the file, not the commit. The hook then sends the amend hint, which tells the model to fold the formatting into that commit. The hint names a file only when all of these conditions are true:

- The call is a Bash command that commits: `git`, optional global options such as `-C <dir>`, then `commit`.
- `terraform fmt` changed the file in this run.
- The last commit holds the file: `git diff-tree --no-commit-id --name-only -r --root HEAD`.

Each agent gets the hint in a different place:

- **Claude Code:** `context` in the mod result.
- **pi and omp:** a text block appended to the tool result.
- **Codex:** `hookSpecificOutput.additionalContext`.

In an agent session, `format-staged-files` formats the staged file before the commit. So the hint appears only when that hook skipped the file. `format-org-tables` explains this in "Write and commit in one command".

## What you see

The hook shows you no message when it formats a file. It drops the stderr of `terraform fmt`, so a parse error does not show as hook output. "Failure behavior" lists the messages that a failure shows.

## Settings

| Setting                | Effect                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_HOOKS_DISABLE` | A list of the hooks that are off, separated by spaces or commas. When it names `format-terraform`, the hook does nothing. |
| `TMPDIR`               | The hook skips the files under this folder.                                                                               |

To turn the hook off until you quit, run [`/toggle-hook`](../toggle-hook/README.md) in Claude Code, pi, or omp. Codex has no command, so set the variable when you start it:

```sh
CLAUDE_HOOKS_DISABLE=format-terraform codex
```

To turn the hook off for good in one agent, remove it from the setting in the "Loaded by" column of the table at the top. `format-staged-files` removes `CLAUDE_HOOKS_DISABLE` before it runs the formatters, so the pre-commit run still formats.

## Failure behavior

The hook fails open: it never blocks a call and never marks a result as an error. Each of these failures leaves the file as it is, with no message:

- `terraform` is not on `PATH`.
- The file does not parse. `terraform fmt` exits 2.
- A run takes more than 10 s, and the hook stops it.

Nothing reports a parse error to the model, because `lint-code` does not check Terraform. [`docs/research.md`](docs/research.md#parse-errors) tells why `terraform validate` and tflint do not fill this gap.

When an adapter throws an error, each agent does a different thing:

| Adapter           | On a failure                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Mod               | Claude Code skips a hook that throws, and the result stands.                                      |
| `pi.ts`, `omp.ts` | The handler catches the error and returns nothing.                                                |
| `command.ts`      | Node exits 1, which Codex shows as a failed hook and does not block. A missing terraform exits 0. |

With no `node`, the Codex entry exits 0 and the hook does not run. Then the `SessionStart` check of Codex shows you a warning.

## Testing

[`test/check.ts`](test/check.ts) runs `command.ts` and the adapters against the real `terraform` and git. [`docs/testing.md`](docs/testing.md) tells how to run it and what it covers.

## Design notes

### Why this is a separate hook

The hook copies the design of [`format-org-tables`](../format-org-tables/README.md), which is also one formatter that is not Prettier, selected by extension. No official hook does this job, see [`docs/research.md`](docs/research.md#other-hooks).

### One run for each file

The hook starts `terraform fmt` once for each file. One run with all files does not work: when one file does not parse, `terraform fmt` exits 2 and does not format the files after it. One run takes about 15 ms, see [`docs/research.md`](docs/research.md#run-time).

`terraform fmt` prints a name that is not the path that the hook gave. So the hook only checks whether the output is empty.

### Files

| File                                                             | Role                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`core.ts`](core.ts)                                             | Finds the files and runs `terraform fmt`. No Node imports.                |
| [`io.ts`](io.ts)                                                 | The file and process functions of the core under Node                     |
| [`command.ts`](command.ts)                                       | The command hook for Codex and `format-staged-files`                      |
| [`pi.ts`](pi.ts)                                                 | The pi extension, which omp also loads                                    |
| [`omp.ts`](omp.ts)                                               | The omp extension, after `pi.ts`: the omp calls that `pi.ts` does not see |
| [`hooks/register.ts`](hooks/register.ts), `hooks/hooks.json`     | The Claude Code mod                                                       |
| [`dot_claude-plugin/plugin.json`](dot_claude-plugin/plugin.json) | The plugin manifest, deployed as `.claude-plugin/plugin.json`             |
