# format-code

Formats the files that a Write, an Edit, or a Bash call changed, with the formatter for the extension of each file. It covers the languages that Prettier has no parser for, so [`format-prettier`](../format-prettier/README.md) cannot format them:

| Extensions      | Formatter                                                                   | Command                              | Key         |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------ | ----------- |
| `.tf` `.tfvars` | [terraform fmt](https://developer.hashicorp.com/terraform/cli/commands/fmt) | `terraform fmt -no-color <file>`     | `terraform` |
| `.sh` `.bash`   | [shfmt](https://github.com/mvdan/sh)                                        | `shfmt -l -w [-i 2 -ci] <file>`      | `shfmt`     |
| `.py` `.pyi`    | [ruff format](https://docs.astral.sh/ruff/formatter/)                       | `ruff format --force-exclude <file>` | `ruff`      |

The key turns off one formatter in one repository, see [Settings](#settings). To add a formatter, add a row to `FORMATTERS` in [`core.ts`](core.ts), its extensions to `NAMED`, and its key to `PARTS` in [`toggle-hook/core.ts`](../toggle-hook/core.ts). The toggle-hook test fails when the keys differ.

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
- **Bash:** each path with an extension from the table that the command text names, absolute or relative to the session cwd. A path counts only when its mtime is at most 120 s old, so a file that the command only read stays as it is. `format-org-tables` uses the same rule, and its README gives the reasons.

The hook skips these paths, with no output:

- A path that is not an existing file with an extension from the table.
- A path under `/tmp`, `/var/tmp`, or `$TMPDIR`, because the scratchpad of the agent is there.
- A file in a repository whose git config turns off the hook or the formatter of the file, see [Settings](#settings).
- A Python file that the `exclude` list of the ruff config holds, see [ruff format](#ruff-format).

The hook misses a Bash command that writes a file but does not name it, for example a script, `terraform init`, or a `find -exec`. It also misses a shell script with no extension, such as a file with only a `#!/bin/sh` line. A relative path resolves against the session cwd only, not against a folder that a `cd` in the command moves to.

## Requirements

- **terraform** on `PATH`, for `.tf` and `.tfvars`. Tested with Terraform 1.16.5 and 1.16.6.
- **shfmt** on `PATH`, for `.sh` and `.bash`. Tested with shfmt 3.14.1.
- **ruff** on `PATH`, for `.py` and `.pyi`. Tested with ruff 0.17.0. [`lint-code`](../lint-code/README.md#requirements) tells how to install it.

Without a formatter, the hook leaves its files as they are.

- **git**, for the amend hint.
- **Node 23.6 or later** for `command.ts`, which Codex and `format-staged-files` run. The mod, `pi.ts`, and `omp.ts` run in the process of the agent and need no `node` of their own.

```sh
brew install hashicorp/tap/terraform shfmt ruff
```

## How it works

1. The hook stops when `AGENT_HOOKS_DISABLE` names `format-code`.
2. It finds the files to format, as "What it checks" tells.
3. For each file, it reads `agent-hook.format-code.enabled` and the key of the formatter with `git config --type=bool --get`, in the folder of the file. It skips the file when either key is `false`. It runs git once for each folder and key, and only for a file that passed the checks of step 2.
4. It runs the command of the formatter once for each file, in the folder of the file, with a limit of 10 s.
5. When the call is a Bash command that commits, it asks git whether the last commit holds each file that a formatter changed.
6. It sends the amend hint for each file that the last commit holds.

The hook finds the changed files from the stdout of each formatter, and reads no file text. `terraform fmt` always prints the name of a file that it changed, and shfmt prints it because of `-l`. Both print nothing for a file that they left as it was. ruff prints a summary on each run, so for ruff only a summary with `reformatted` counts as a change, see [ruff format](#ruff-format).

## What the model sees

The hook formats the file in place and usually sends nothing to the model. Its only output is the amend hint. `command.ts` exits 0, also when it prints the hint.

### Write and commit in one command

A Bash call can write a file and commit it. Formatting the file after the call fixes the file, not the commit. The hook then sends the amend hint, which tells the model to fold the formatting into that commit. The hint names a file only when all of these conditions are true:

- The call is a Bash command that commits: `git`, optional global options such as `-C <dir>`, then `commit`.
- A formatter changed the file in this run.
- The last commit holds the file: `git diff-tree --no-commit-id --name-only -r --root HEAD`.

Each agent gets the hint in a different place:

- **Claude Code:** `context` in the mod result.
- **pi and omp:** a text block appended to the tool result.
- **Codex:** `hookSpecificOutput.additionalContext`.

In an agent session, `format-staged-files` formats the staged file before the commit. So the hint appears only when that hook skipped the file. `format-org-tables` explains this in "Write and commit in one command".

## What you see

The hook shows you no message when it formats a file. It drops the stderr of the formatters, so a parse error does not show as hook output. "Failure behavior" lists the messages that a failure shows.

## Settings

| Setting                                           | Effect                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `AGENT_HOOKS_DISABLE`                             | A list of the hooks that are off, separated by spaces or commas. When it names `format-code`, the hook does nothing. |
| `git config agent-hook.format-code.enabled false` | Turns the hook off in one repository, across sessions.                                                               |
| `git config agent-hook.format-code.<key> false`   | Turns off one formatter in one repository, by the key in the table at the top. The other formatter still runs.       |
| `TMPDIR`                                          | The hook skips the files under this folder.                                                                          |

To turn the hook off until you quit, run [`/toggle-hook`](../toggle-hook/README.md) in Claude Code, pi, or omp. Codex has no command, so set the variable when you start it:

```sh
AGENT_HOOKS_DISABLE=format-code codex
```

To turn off the hook or one formatter in one repository, run `/toggle-hook --repo format-code` or `/toggle-hook --repo format-code.shfmt`. In Codex, run the `git config` command of the table in your own terminal. A value that is not a boolean, such as `banana`, keeps the formatter on. The dcg pack `local.agent_hook` blocks an agent command that writes the key.

To turn the hook off for good in one agent, remove it from the setting in the "Loaded by" column of the table at the top. `format-staged-files` removes `AGENT_HOOKS_DISABLE` before it runs the formatters, so the pre-commit run still formats. The git config keys still apply in the pre-commit run, because the hook reads them itself.

## Failure behavior

The hook fails open: it never blocks a call and never marks a result as an error. Each of these failures leaves the file as it is, with no message:

- The formatter is not on `PATH`.
- The file does not parse. `terraform fmt` and ruff exit 2, and shfmt exits 1.
- A run takes more than 10 s, and the hook stops it.

[`lint-code`](../lint-code/README.md) reports the parse error to the model: tflint for a `.tf` file, shellcheck for a shell file, and `ruff check` for a `.py` file. Nothing reports a parse error in a `.tfvars` file.

When an adapter throws an error, each agent does a different thing:

| Adapter           | On a failure                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Mod               | Claude Code skips a hook that throws, and the result stands.                                      |
| `pi.ts`, `omp.ts` | The handler catches the error and returns nothing.                                                |
| `command.ts`      | Node exits 1, which Codex shows as a failed hook and does not block. A missing formatter exits 0. |

With no `node`, the Codex entry exits 0 and the hook does not run. Then the `SessionStart` check of Codex shows you a warning.

## Testing

[`test/check.ts`](test/check.ts) runs `command.ts` and the adapters against the real `terraform`, shfmt, ruff, and git. [`docs/testing.md`](docs/testing.md) tells how to run it and what it covers.

## Design notes

### One hook for the formatters that are not Prettier

The hook started as `format-terraform`, a copy of the design of [`format-org-tables`](../format-org-tables/README.md). Each formatter of this hook runs one command on one file and prints the name of a changed file, so a new formatter is one row in `FORMATTERS`, not a new folder with its own adapters and test. [`docs/hooks/decisions.md`](../../../docs/hooks/decisions.md#format-code-holds-the-formatters-that-are-not-prettier) gives the decision. No official hook does this job, see [`docs/research.md`](docs/research.md#other-hooks).

### One run for each file

The hook starts the formatter once for each file. One run with all files does not work: when one file does not parse, `terraform fmt` exits 2 and does not format the files after it. A `terraform fmt` run takes about 15 ms, and a shfmt run about 1 ms, see [`docs/research.md`](docs/research.md#run-time).

`terraform fmt` prints a name that is not the path that the hook gave. So the hook only checks whether the output is empty.

### shfmt and .editorconfig

shfmt reads its style from `.editorconfig`, but only when the command gives no printer flag. Without an `.editorconfig`, shfmt indents with tabs. So the hook looks for an `.editorconfig` in the folder of the file and in each folder above it:

- **Found:** the hook runs `shfmt -l -w <file>`, and the `.editorconfig` sets the style. An `.editorconfig` with no shell settings gives the shfmt defaults, which indent with tabs.
- **Not found:** the hook adds `-i 2 -ci`: a 2-space indent, and an indent for each branch of a `case`. These are the flags of `just fmt` in this repo. With the defaults, shfmt changed 21 of the 23 shell files in this repo. With `-i 2 -ci`, it changed 8, and only in small ways, such as `(( rc > status ))` to `((rc > status))`.

A `~/.editorconfig` does not replace the fallback, because the devcontainer repositories are under `/workspaces`, outside `$HOME`.

### ruff format

ruff format was chosen over Black because `lint-code` already uses ruff, so it adds no tool. It reads the same config as `ruff check` (`[tool.ruff]` and `[tool.ruff.format]` in `pyproject.toml` or `ruff.toml`). Its default style is the Black style: a line length of 88 and double quotes.

- **`--force-exclude`:** ruff formats a file that its command names, also when the `exclude` list of the project config holds it. With this flag, the list applies. ruff then prints `warning: No Python files found` and exits 0.
- **The change test:** ruff prints `1 file reformatted` or `1 file left unchanged`, and it has no flag that prints only the changed files. `--quiet` prints nothing in both cases. So the ruff row of `FORMATTERS` has a `changed` function that looks for `reformatted`. The other rows have no `changed` function, and for them any stdout counts as a change.

ruff format does not sort imports. That is the lint rule `I` of `ruff check --fix`, and the hook does not run it.

### Files

| File                                                             | Role                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`core.ts`](core.ts)                                             | Finds the files and runs the formatters. No Node imports.                 |
| [`io.ts`](io.ts)                                                 | The file and process functions of the core under Node                     |
| [`command.ts`](command.ts)                                       | The command hook for Codex and `format-staged-files`                      |
| [`pi.ts`](pi.ts)                                                 | The pi extension, which omp also loads                                    |
| [`omp.ts`](omp.ts)                                               | The omp extension, after `pi.ts`: the omp calls that `pi.ts` does not see |
| [`hooks/register.ts`](hooks/register.ts), `hooks/hooks.json`     | The Claude Code mod                                                       |
| [`dot_claude-plugin/plugin.json`](dot_claude-plugin/plugin.json) | The plugin manifest, deployed as `.claude-plugin/plugin.json`             |
