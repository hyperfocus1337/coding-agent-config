# lint-code

Lints each file that a Write, an Edit, or a Bash call changed, with the linter for its extension, and gives the errors to the model. The model then sees a lint error in the result of the call that caused it, not only when a later edit touches the same file.

One core, [`core.ts`](core.ts), serves four agents through three adapters. An adapter is the code that connects the core to one agent:

| Agent       | Adapter                                                                                                                                                                 | Loaded by                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash adds `context` after `next`                                                       | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                    |
| pi          | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash returns `{ content, isError: true }`                                                                           | `extensions` in `dot_pi/agent/modify_settings.json`                                  |
| omp         | [`pi.ts`](pi.ts) as in pi, and [`omp.ts`](omp.ts): `tool_result` on an omp edit of more than one file, an `ast_edit` that a write to `xd://resolve` applies, and `eval` | `extensions` in `dot_omp/private_agent/private_config.yml`                           |
| Codex       | [`command.ts`](command.ts): exit code 2 with the errors on stderr                                                                                                       | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts` |

## What it checks

The hook lints these files, by extension:

| Extension                                             | Linter                                                  | Invocation                                | Documentation                                 |
| ----------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| `.py`                                                 | [ruff](https://github.com/astral-sh/ruff)               | `ruff check --quiet`                      | https://docs.astral.sh/ruff/                  |
| `.js` `.jsx` `.ts` `.tsx` `.mts` `.cts` `.mjs` `.cjs` | [oxlint](https://github.com/oxc-project/oxc)            | `oxlint --deny-warnings`                  | https://oxc.rs/docs/guide/usage/linter        |
| `.sh` `.bash`                                         | [shellcheck](https://github.com/koalaman/shellcheck)    | `shellcheck -S warning`                   | https://www.shellcheck.net/wiki/              |
| `.yml` `.yaml` (plain)                                | [yamllint](https://github.com/adrienverge/yamllint)     | `yamllint -c config/.yamllint`            | https://yamllint.readthedocs.io/              |
| `.yml` `.yaml` (Ansible)                              | [ansible-lint](https://github.com/ansible/ansible-lint) | `ansible-lint -c config/.ansible-lint -q` | https://ansible.readthedocs.io/projects/lint/ |

YAML goes to one of two linters, see [YAML routing](#yaml-routing). The hook does not check `.tf` and `.tfvars` files. [`format-code`](../format-code/README.md) formats them, because `terraform fmt` is a formatter, not a linter.

The hook runs after each of these calls, also after a call that failed, because a failed Bash call can still have written a file:

- **Write and Edit:** the file that the call names.
- **Bash:** the files that the command names and just wrote. See [Bash calls](#bash-calls).
- **omp only:** each file of an `edit` of more than one file, each file that an applied `ast_edit` changed, and the files that the code of an `eval` call names.

The hook skips files under `/tmp`, `/var/tmp`, and `$TMPDIR`. A scratchpad file is not project code, so a lint error in it must not block a tool result.

## Requirements

The hook calls each linter binary directly, with no `npx` fallback. Install the linters that you want active. The hook skips a linter that is not installed.

macOS (Homebrew):

```sh
brew install ruff shellcheck yamllint ansible-lint
pnpm add -g oxlint
```

Debian and Ubuntu:

```sh
apt install -y shellcheck yamllint
uv tool install ruff # apt's ruff lags; uv tracks upstream
uv tool install ansible-lint
npm install -g oxlint
```

On Debian and Ubuntu, install ruff with `uv`, because `apt` ships an older build. [`docs/research.md`](docs/research.md) compares the install methods and tells why the hook uses oxlint.

The adapters have these requirements:

- **Claude Code 2.1.296 or later** for the mod. It is the oldest version tested.
- **Node 23.6 or later** on `PATH` for `command.ts` and `dot_codex/hooks/apply-patch.ts`, which Codex runs. Node 23.6 runs `.ts` files without a flag. The mod, `pi.ts`, and `omp.ts` run in the runtime of their agent and need no `node`.
- **Codex trust:** Codex runs a hook only after you trust its entry. After the change from `hook.sh` to `command.ts`, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## How it works

For each tool call, the core does these steps:

1. It finds the target files of the call. A Write or an Edit names one file, which the hook lints at any age. For a Bash call, see [Bash calls](#bash-calls). A relative path resolves against the session working directory.
2. It drops each path under `/tmp`, `/var/tmp`, or `$TMPDIR`, each path that does not exist, and each path that is not a regular file.
3. It picks the linter for the extension of each file. It skips a file when `CLAUDE_LINT_DISABLE` turns its linter off, or when no linter is installed.
4. It runs the linters one file after the other, and lints every target before it stops. So one Bash command reports every file that it wrote, not only the first failure.
5. When at least one linter exits with a code other than 0, it gives the output of all the linters that ran to the model.

### Bash calls

A Bash payload names no file. So the hook reads the paths out of `tool_input.command`, the way [`format-org-tables`](../format-org-tables/README.md) does, and keeps the paths with a supported extension.

A command also names the files that it only reads, as in `cat app.py`. So the hook lints a named file only when its mtime is at most 120 seconds old, which shows that the command wrote it. A command that writes a file early and then runs for minutes falls outside that window, and the hook lints the file again on the next edit.

[`docs/implementation.md`](docs/implementation.md#paths-in-a-bash-command) gives the reasons for this design.

### YAML routing

The hook treats a YAML file as Ansible and sends it to `ansible-lint`, which runs yamllint internally, when one of these is true:

- The path holds a standard Ansible directory: `roles/`, `tasks/`, `handlers/`, `playbooks/`, `group_vars/`, `host_vars/`, or `molecule/`.
- The file has an entry point name: `site`, `playbook`, `main`, or `requirements`, with the extension `.yml` or `.yaml`.
- A line of the file starts with the key `hosts:`, `tasks:`, or `roles:`, after optional spaces and an optional `- `.

All other YAML goes to `yamllint`.

## What the model sees

A Write or an Edit has already run when the hook starts, so the hook cannot block it. The hook gives the errors to the model in the way that each agent allows:

- **Claude Code:** the mod adds the errors to the `context` of the result, after the line `Lint errors in the files this call changed. Fix them:`. The model gets them with the result.
- **pi and omp:** the extension appends a text block that starts with `Lint errors:` to the result content, and marks the result as an error.
- **Codex:** `command.ts` writes the errors to stderr and exits 2. A `PostToolUse` hook reaches the model only with exit code 2. With exit code 0, its output goes to the transcript only.

`command.ts` uses these exit codes:

- **0:** no linter failed, or the call changed no file to lint. No output.
- **1:** the payload is not valid JSON. The model does not see it.
- **2:** at least one linter failed. The output of all the linters that ran is on stderr.

The hook reports only when a linter exits with a code other than 0. `oxlint` 1.87.0 reports its built-in rules as warnings, also a real bug such as an assignment to a `const`, and exits 0 for warnings. So the hook passes `--deny-warnings`, which makes oxlint exit 1 on a warning.

## What you see

In Codex, when Node 23.6 or later is not on `PATH`, a `SessionStart` check shows a warning. The warning lists `lint-code` with the other hooks that are off.

## Settings

### Turn the hook off

To turn the whole hook off in a running agent, run `/toggle-hook lint-code`. The command adds `lint-code` to `CLAUDE_HOOKS_DISABLE`. Codex has no such command, so set `CLAUDE_HOOKS_DISABLE=lint-code` when you start it. See [`toggle-hook`](../toggle-hook/README.md).

To remove the hook from one agent for good, remove its entry from the file in the "Loaded by" column of the table at the top.

### Turn off one linter

`CLAUDE_LINT_DISABLE` holds a list of keys, separated by spaces or commas. The hook reads it at run time, so export it in your shell, or set it in `env` in `settings.json`.

| Key    | Turns off                                                        |
| ------ | ---------------------------------------------------------------- |
| `py`   | ruff                                                             |
| `js`   | oxlint                                                           |
| `sh`   | shellcheck                                                       |
| `yaml` | yamllint and ansible-lint                                        |
| `all`  | The whole hook, and also [`lint-prose`](../lint-prose/README.md) |

```sh
export CLAUDE_LINT_DISABLE="yaml"      # stop linting YAML
export CLAUDE_LINT_DISABLE="yaml,sh"   # skip YAML and shell
export CLAUDE_LINT_DISABLE="all"       # off
```

### Tune the linters

To tune YAML instead of turning it off, edit the bundled configs in [`config/`](config/). The hook passes them with `-c` on each run. So the hook ignores the `.yamllint` and `.ansible-lint` of a repository, and you do not copy a config into each project.

- [`config/dot_yamllint`](config/dot_yamllint), deployed as `.yamllint`, sets relaxed indentation and line-length rules for plain YAML ([yamllint config docs](https://yamllint.readthedocs.io/en/stable/configuration.html)).
- [`config/dot_ansible-lint`](config/dot_ansible-lint), deployed as `.ansible-lint`, silences the noisy `yaml[indentation]` and `yaml[line-length]` findings for Ansible files with `skip_list` ([ansible-lint config docs](https://ansible.readthedocs.io/projects/lint/configuring/)). To get them as warnings that do not block, use the `warn_list` that the file holds as a comment. ansible-lint finds its embedded yamllint config by a directory search, so you tune the indentation for Ansible in this file, not in `config/dot_yamllint`.

oxlint finds a project `.oxlintrc.json` in the directory of the file. A rule that this file sets to `off` stays off, also with `--deny-warnings`.

If a linter reports too much, change its severity in [`core.ts`](core.ts), for example to `shellcheck -S error`.

## Failure behavior

The hook fails open in every agent: when the lint run breaks, the tool result stays as it is.

- **A linter is not installed:** the hook skips its files.
- **The mod throws in Claude Code:** Claude Code skips the mod hook, and the result stands.
- **`pi.ts` or `omp.ts` throws:** `pi.ts` catches its own errors, and the result stays as it is. `omp.ts` runs through the same code.
- **`command.ts` gets a bad payload:** it exits 1. Only exit code 2 reaches the model.
- **A linter runs too long:** the mod stops each linter after 30 s, the default timeout of `$.process.run`. Codex stops the whole hook after 15 s.
- **Codex has no `node`:** the Codex entries start with `command -v node >/dev/null || exit 0`, so a machine without Node is not blocked.

## Testing

`node test/check.ts` tests the core and each adapter, and `just hooks-check` runs it. [`docs/testing.md`](docs/testing.md) tells how to run it, what each group of cases checks, and what it needs on `PATH`.
