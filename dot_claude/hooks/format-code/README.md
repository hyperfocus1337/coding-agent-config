# format-code

Formats the files that a Write, an Edit, or a Bash call changed, with the formatter for the extension of each file. It runs after each tool call, so the model reads back formatted files, and Markdown and Org tables stay aligned while the model edits them.

| Extensions                                                  | Formatter                                                                   | Command                                    | Key          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------ | ------------ |
| `.md` `.ts` `.json` `.css` `.html` `.yaml` `.toml` and more | [oxfmt](docs/oxfmt.md), all files in one run                                | `oxfmt <files>`                            | `oxfmt`      |
| `.org`                                                      | [Org table alignment](docs/org-tables.md) in Emacs, all files in one run    | `emacs --batch --no-init-file --eval <el>` | `org-tables` |
| `.tf` `.tfvars`                                             | [terraform fmt](https://developer.hashicorp.com/terraform/cli/commands/fmt) | `terraform fmt -no-color <file>`           | `terraform`  |
| `.sh` `.bash`                                               | [shfmt](https://github.com/mvdan/sh)                                        | `shfmt -l -w [-i 2 -ci] <file>`            | `shfmt`      |
| `.py` `.pyi`                                                | [ruff format](https://docs.astral.sh/ruff/formatter/)                       | `ruff format --force-exclude <file>`       | `ruff`       |

[`docs/oxfmt.md`](docs/oxfmt.md) lists the oxfmt extensions. A Bash call gives oxfmt only `.md` and `.markdown`, see [Bash: Markdown only](docs/oxfmt.md#bash-markdown-only).

The key turns off one formatter, see [Settings](#settings). To add a formatter, add a module to [`formatters/`](formatters), add it to `FORMATTERS` in [`core.ts`](core.ts), and add its key to `PARTS` in [`toggle-hook/core.ts`](../toggle-hook/core.ts). The core takes the extensions of a Bash command from the modules. The toggle-hook test fails when the keys differ.

One core, [`core.ts`](core.ts), serves four agents through three adapters. A mod is a Claude Code hook module that runs in the Claude Code process, and a command hook is a program that the agent starts for each call.

| Agent       | Adapter                                                                                                                                                                 | Loaded by                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash formats after `next`                                                              | `CLAUDE_CODE_PLUGIN_DIRS` in `private_settings.json.tmpl`                            |
| pi          | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash                                                                                                                | `extensions` in `dot_pi/agent/modify_settings.json`                                  |
| omp         | [`pi.ts`](pi.ts) as in pi, and [`omp.ts`](omp.ts): `tool_result` on an omp edit of more than one file, an `ast_edit` that a write to `xd://resolve` applies, and `eval` | `extensions` in `dot_omp/private_agent/private_config.yml`                           |
| Codex       | [`command.ts`](command.ts), a command hook: the amend hint as `hookSpecificOutput` JSON on stdout                                                                       | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts` |

The git pre-commit hook [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) also runs `command.ts`, once for each commit. It names all staged files in `tool_input.file_paths`, a field that no agent payload has.

## What it checks

The hook runs after each Write, Edit, and Bash call. It runs also after a call that failed, because a failed Bash command can still write a file. It formats these files:

- **Write and Edit:** the file that the call names.
- **Bash:** each file with an extension of the table that changed during the call, through the sweep in [`sweep.ts`](sweep.ts): the paths that the command text names, and the changed and untracked files that git reports in the repository of the session cwd, of each absolute path in the command, and of each repository inside them. When the command commits, also the files of the last commit. A file counts only if it changed after the call started, so a file that the command only read stays as it is. In Codex, a file counts if it changed in the last 120 s. [`docs/implementation.md`](docs/implementation.md#the-bash-sweep) gives the details.
- **omp:** `omp.ts` also formats each file of an edit of more than one file, and each file of an applied `ast_edit`. It treats the code of an `eval` call as a Bash command.
- **Codex `apply_patch`:** `apply-patch.ts` runs `command.ts` once for each file in the patch, as a Write.

The hook skips these paths, with no output:

- A path that is not an existing file with an extension from the table.
- A path under `/tmp`, `/var/tmp`, or `$TMPDIR`, because the scratchpad of the agent is there.
- A file whose formatter the session or the repository turns off, see [Settings](#settings).
- An Org file with no line that starts with `|`, see [Files without tables](docs/org-tables.md#files-without-tables).
- A file that `.prettierignore` lists, for oxfmt, and a Python file that the `exclude` list of the ruff config holds, see [ruff format](#ruff-format).

The hook misses a file that git ignores and the command does not name, for example one that a script writes. It also misses a shell script with no extension, such as a file with only a `#!/bin/sh` line, and a file in another repository that the command reaches only by a relative path.

## Requirements

- **oxfmt** on `PATH`, for the oxfmt extensions: the npm package at a pinned version, see [`docs/oxfmt.md`](docs/oxfmt.md#requirements).
- **Emacs** on `PATH`, for `.org`. Tested with GNU Emacs 30.1, 30.2, and 31.1.
- **terraform** on `PATH`, for `.tf` and `.tfvars`. Tested with Terraform 1.16.5 and 1.16.6.
- **shfmt** on `PATH`, for `.sh` and `.bash`. Tested with shfmt 3.14.1.
- **ruff** on `PATH`, for `.py` and `.pyi`. Tested with ruff 0.17.0. [`lint-code`](../lint-code/README.md#requirements) tells how to install it.

Without a formatter, the hook leaves its files as they are. The hook never installs a formatter from the network.

- **git**, for the Bash sweep, the repository keys, and the amend hint.
- **Node 23.6 or later** for `command.ts`, which Codex and `format-staged-files` run. The mod, `pi.ts`, and `omp.ts` run in the process of the agent and need no `node` of their own.

```sh
brew install emacs hashicorp/tap/terraform shfmt ruff
```

```sh
pnpm add -g oxfmt@0.74.0
```

## How it works

1. The hook stops when `AGENT_HOOKS_DISABLE` names `format-code`.
2. It finds the files to format, as "What it checks" tells. It resolves each path against the session folder and removes `.` and `..` segments, so each file counts once.
3. It skips each file whose formatter `AGENT_HOOKS_DISABLE` names as `format-code.<key>`.
4. For each file, it reads `agent-hook.format-code.enabled` and the key of the formatter with `git config --type=bool --get`, in the folder of the file. It skips the file when either key is `false`. It runs git once for each folder and key, and only for a file that passed the checks before.
5. When the call is a Bash command that commits, it keeps the text of each file.
6. It runs each formatter on its files. oxfmt and Emacs take all their files in one run. terraform fmt, shfmt, and ruff take one file for each run, in the folder of the file. Each run stops after 10 s, oxfmt after 20 s.
7. When it kept the text in step 5, it sends the amend hint for each file that a formatter changed and that the last commit holds.

## What the model sees

The hook formats the file in place and usually sends nothing to the model. The model sees the formatted file when it reads the file again. Its only output is the amend hint. `command.ts` exits 0, also when it prints the hint.

### Write and commit in one command

A Bash call can write a file and commit it. Formatting the file after the call fixes the file, not the commit. The hook then sends the amend hint, which tells the model to fold the formatting into that commit. The hint names a file only when all of these conditions are true:

- The call is a Bash command that commits: `git`, optional global options such as `-C <dir>`, then `commit`.
- A formatter changed the file in this run. The hook compares the text before and after the run.
- The last commit holds the file: `git diff-tree --no-commit-id --name-only -r --root HEAD`.

The hint names the formatters and the files:

```text
oxfmt reformatted files after your commit, so the commit holds the unformatted version and the working tree is now dirty: <files>. Fold the formatting into that commit (amend, or a fixup commit if it is already pushed).
```

| Adapter           | How the hint reaches the model                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Mod               | `context` on the result of the call                                                                                         |
| `pi.ts`, `omp.ts` | A text block added after the content of the result                                                                          |
| `command.ts`      | `hookSpecificOutput.additionalContext` on stdout. `hookEventName` is the `hook_event_name` of the payload, or `PostToolUse` |

In an agent session, `format-staged-files` formats the staged file before the commit. So the hint appears only when that hook skipped the file: a file with unstaged changes, a `git commit --no-verify`, or a computer where git has no `node`.

## What you see

The hook shows you no message when it formats a file. It drops the stderr of the formatters, so a parse error does not show as hook output. "Failure behavior" lists the messages that a failure shows.

## Settings

| Setting                                           | Effect                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENT_HOOKS_DISABLE`                             | A list of the hooks and tools that are off, separated by spaces or commas. `format-code` turns off the hook, `format-code.<key>` one formatter. |
| `git config agent-hook.format-code.enabled false` | Turns the hook off in one repository, across sessions.                                                                                          |
| `git config agent-hook.format-code.<key> false`   | Turns off one formatter in one repository, by the key in the table at the top. The other formatters still run.                                  |
| `TMPDIR`                                          | The hook skips the files under this folder.                                                                                                     |

[`docs/oxfmt.md`](docs/oxfmt.md#settings) gives the config files and ignore files of oxfmt.

To turn the hook or one formatter off until you quit, run [`/toggle-hook format-code`](../toggle-hook/README.md) or `/toggle-hook format-code.oxfmt` in Claude Code, pi, or omp. Codex has no command, so set the variable when you start it:

```sh
AGENT_HOOKS_DISABLE=format-code.oxfmt codex
```

To turn off the hook or one formatter in one repository, run `/toggle-hook --repo format-code` or `/toggle-hook --repo format-code.shfmt`. In Codex, run the `git config` command of the table in your own terminal. A value that is not a boolean, such as `banana`, keeps the formatter on. The dcg pack `local.agent_hook` blocks an agent command that writes the key.

To turn the hook off for good in one agent, remove it from the setting in the "Loaded by" column of the adapter table. In Codex, remove the two `format-code` entries in `dot_codex/modify_hooks.json`, one for Bash and one for `apply_patch`. `format-staged-files` removes `AGENT_HOOKS_DISABLE` before it runs the formatters, so the pre-commit run still formats. The git config keys still apply in the pre-commit run, because the hook reads them itself.

## Failure behavior

The hook fails open: it never blocks a call and never marks a result as an error. A formatter changes the layout of working code, and must not reject an edit. Each of these failures leaves the file as it is, with no message:

- The formatter is not on `PATH`.
- The file does not parse. `terraform fmt`, ruff, and oxfmt exit 2, and shfmt exits 1. oxfmt still formats the other files of its run.
- A run takes more than its limit, and the hook stops it. Codex stops `command.ts` after 30 s, the `timeout` of its entry.
- git fails, for example outside a repository or with no `HEAD`. The sweep then finds no files from that list.

[`lint-code`](../lint-code/README.md) reports the parse error to the model: tflint for a `.tf` file, shellcheck for a shell file, `ruff check` for a `.py` file, and oxlint or the YAML linters for their files. Nothing reports a parse error in a `.tfvars` file.

When an adapter throws an error, each agent does a different thing:

| Adapter           | On a failure                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Mod               | Claude Code skips a hook that throws, and the result stands.                                      |
| `pi.ts`, `omp.ts` | The handler catches the error and returns nothing.                                                |
| `command.ts`      | Node exits 1, which Codex shows as a failed hook and does not block. A missing formatter exits 0. |

With no `node`, the Codex entry exits 0 and the hook does not run. Then the `SessionStart` check of Codex shows you a warning.

## Testing

[`test/check.ts`](test/check.ts) runs `command.ts` and the adapters against the real formatters and git. [`docs/testing.md`](docs/testing.md) tells how to run it and what it covers.

## Design notes

[`docs/implementation.md`](docs/implementation.md) gives the design that is the same for each formatter: the Bash sweep, the events, and the amend hint. [`docs/oxfmt.md`](docs/oxfmt.md) and [`docs/org-tables.md`](docs/org-tables.md) give the design of those two formatters.

### One hook for all formatters

The hook started as `format-terraform`, a copy of the design of `format-org-tables`. On 2026-11-08, the separate hooks `format-oxfmt` and `format-org-tables` became formatters of this hook, because all three found the files of a call with the same sweep. So one sweep serves each Bash call, and a new formatter is one module in `formatters/`, not a new folder with its own adapters and test. [`docs/hooks/decisions.md`](../../../docs/hooks/decisions.md#format-code-holds-all-formatters) gives the decision, and [one module for each tool](../../../docs/hooks/decisions.md#one-module-for-each-tool-in-lint-code-and-format-code) tells why each formatter has its own module. No official hook does this job, see [`docs/research.md`](docs/research.md#other-hooks).

### One run, or one run for each file

A formatter module returns its runs for the files of a call. oxfmt and Emacs take all files in one run, because a run of Emacs takes about 1.4 s to start. terraform fmt, shfmt, and ruff take one file for each run, through `eachFile` in [`formatters/each-file.ts`](formatters/each-file.ts): when one file does not parse, `terraform fmt` exits 2 and does not format the files after it. A `terraform fmt` run takes about 15 ms, and a shfmt run about 1 ms, see [`docs/research.md`](docs/research.md#run-time).

### shfmt and .editorconfig

shfmt reads its style from `.editorconfig`, but only when the command gives no printer flag. Without an `.editorconfig`, shfmt indents with tabs. So the hook looks for an `.editorconfig` in the folder of the file and in each folder above it:

- **Found:** the hook runs `shfmt -l -w <file>`, and the `.editorconfig` sets the style. An `.editorconfig` with no shell settings gives the shfmt defaults, which indent with tabs.
- **Not found:** the hook adds `-i 2 -ci`: a 2-space indent, and an indent for each branch of a `case`. These are the flags of `just fmt` in this repo. With the defaults, shfmt changed 21 of the 23 shell files in this repo. With `-i 2 -ci`, it changed 8, and only in small ways, such as `(( rc > status ))` to `((rc > status))`.

A `~/.editorconfig` does not replace the fallback, because the devcontainer repositories are under `/workspaces`, outside `$HOME`.

### ruff format

ruff format was chosen over Black because `lint-code` already uses ruff, so it adds no tool. It reads the same config as `ruff check` (`[tool.ruff]` and `[tool.ruff.format]` in `pyproject.toml` or `ruff.toml`). Its default style is the Black style: a line length of 88 and double quotes.

ruff formats a file that its command names, also when the `exclude` list of the project config holds it. With `--force-exclude`, the list applies. ruff then prints `warning: No Python files found` and exits 0.

ruff format does not sort imports. That is the lint rule `I` of `ruff check --fix`, and the hook does not run it.

### Files

| File                                                             | Role                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`core.ts`](core.ts)                                             | Finds the files and runs the formatters. No Node imports.                 |
| [`formatters/`](formatters)                                      | One module for each formatter: its extensions, key, and runs              |
| [`sweep.ts`](sweep.ts)                                           | The files of a Bash call                                                  |
| [`io.ts`](io.ts)                                                 | The file and process functions of the core under Node                     |
| [`command.ts`](command.ts)                                       | The command hook for Codex and `format-staged-files`                      |
| [`pi.ts`](pi.ts)                                                 | The pi extension, which omp also loads                                    |
| [`omp.ts`](omp.ts)                                               | The omp extension, after `pi.ts`: the omp calls that `pi.ts` does not see |
| [`hooks/register.ts`](hooks/register.ts), `hooks/hooks.json`     | The Claude Code mod                                                       |
| [`dot_claude-plugin/plugin.json`](dot_claude-plugin/plugin.json) | The plugin manifest, deployed as `.claude-plugin/plugin.json`             |
