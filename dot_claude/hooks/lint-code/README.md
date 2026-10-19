# lint-code

Lints each file that a Write, an Edit, or a Bash call changed, with the linter for its extension, and gives the errors to the model.

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                                           | Loaded by                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash adds `context` after `next` | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash returns `{ content, isError: true }`                     | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | [`command.ts`](command.ts): exit code 2 with the errors on stderr                                                 | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts`               |

## How it works

The core finds the files that the call changed, then runs the linter for the extension of each file:

| Extension                                             | Linter                                                  | Invocation                                | Documentation                                 |
| ----------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| `.py`                                                 | [ruff](https://github.com/astral-sh/ruff)               | `ruff check --quiet`                      | https://docs.astral.sh/ruff/                  |
| `.js` `.jsx` `.ts` `.tsx` `.mts` `.cts` `.mjs` `.cjs` | [oxlint](https://github.com/oxc-project/oxc)            | `oxlint --deny-warnings`                  | https://oxc.rs/docs/guide/usage/linter        |
| `.sh` `.bash`                                         | [shellcheck](https://github.com/koalaman/shellcheck)    | `shellcheck -S warning`                   | https://www.shellcheck.net/wiki/              |
| `.yml` `.yaml` (plain)                                | [yamllint](https://github.com/adrienverge/yamllint)     | `yamllint -c config/.yamllint`            | https://yamllint.readthedocs.io/              |
| `.yml` `.yaml` (Ansible)                              | [ansible-lint](https://github.com/ansible/ansible-lint) | `ansible-lint -c config/.ansible-lint -q` | https://ansible.readthedocs.io/projects/lint/ |

YAML goes to one of two linters, see [YAML routing](#yaml-routing). [`format-terraform`](../format-terraform/README.md) formats `.tf` and `.tfvars` files, because `terraform fmt` is a formatter, not a linter. A linter that is not installed is skipped, so a linter you do not install does nothing. A linter that exits with a code other than 0 is a failure, and the model gets its output. The mod stops each linter after 30 s, the default of `$.process.run`. Codex stops the whole hook after 15 s.

## Bash (the paths the command just wrote)

A `Write` or `Edit` payload names the file in `tool_input.file_path`. A Bash payload names none, so a file a shell command wrote (`cat > setup.py <<'EOF'`, a `sed -i`, a redirect) reached no linter at all, and the error surfaced only when a later `Edit` happened to touch the same file.

So on the Bash matchers the hook reads the paths out of `tool_input.command`, the way [`format-org-tables`](../format-org-tables/README.md) does, and keeps the ones with a supported extension. A relative path resolves against the session cwd.

Naming a path is not the same as writing to it. `cat app.py` names it too, and blocking a read on an error that was already in the file helps nobody. So a named file is linted only when its mtime is within 120 seconds of the hook run, which is what separates a file the command wrote from a file it read. A command that writes early and then runs for minutes falls outside that window and is missed; the file is linted again on the next edit. The trade-off is marked with a `shortcut:` comment in `core.ts`.

A Bash call that exits with a code other than 0 can still have written a file, as in `cat > setup.py <<'EOF' ... EOF && python setup.py`. The mod runs after `next` for each result, and pi sends `tool_result` for each result, so a failed call is linted too. Codex sends `PostToolUse` for each Bash call.

Every target is linted before the hook exits, so one command reports every file it wrote instead of stopping at the first failure. Files under `/tmp`, `/var/tmp`, or `$TMPDIR` are skipped on both matchers: a scratchpad file is not project code, so a lint error there should not block a tool result. macOS resolves `/tmp` to `/private/tmp` and `$TMPDIR` to `/private/var/folders/...`, and the path a payload carries holds that prefix while `$TMPDIR` does not, so both sides of the comparison drop a leading `/private`. Without that, a scratchpad script blocked the tool result on lint errors nobody had to fix.

## Turning linters off or tuning them

Set `CLAUDE_LINT_DISABLE` to a space/comma list of keys to skip: `py`, `js`, `sh`, `yaml`, or `all` to disable the hook entirely. The hook reads it at run time, so export it in your shell, or set it in `env` in `settings.json`.

```sh
export CLAUDE_LINT_DISABLE="yaml"      # stop linting YAML
export CLAUDE_LINT_DISABLE="yaml,sh"   # skip YAML and shell
export CLAUDE_LINT_DISABLE="all"       # off
```

To _tune_ YAML rather than disable it, edit the bundled configs in [`config/`](config/); the hook passes them with `-c` on each run, so a repo's own `.yamllint` / `.ansible-lint` is ignored and there is nothing to copy per project:

- [`config/dot_yamllint`](config/dot_yamllint), deployed as `.yamllint`, sets the relaxed indentation and line-length rules for plain YAML ([yamllint config docs](https://yamllint.readthedocs.io/en/stable/configuration.html)).
- [`config/dot_ansible-lint`](config/dot_ansible-lint), deployed as `.ansible-lint`, downgrades the noisy `yaml[indentation]` / `yaml[line-length]` findings to non-blocking warnings for Ansible files ([ansible-lint config docs](https://ansible.readthedocs.io/projects/lint/configuring/)). ansible-lint discovers its embedded yamllint config by directory search, so indentation for Ansible is tuned here via `warn_list`, not in `config/dot_yamllint`.

## YAML routing

YAML is split: a file is treated as Ansible (and sent to `ansible-lint`, which runs yamllint internally) when it sits under a standard Ansible directory (`roles/`, `tasks/`, `handlers/`, `playbooks/`, `group_vars/`, `host_vars/`, `molecule/`), has an entrypoint name (`site.yml`, `playbook.yml`, `main.yml`, `requirements.yml`), or contains a top-level Ansible marker (`hosts:`, `tasks:`, `roles:`, `ansible.builtin.`). Everything else goes to `yamllint`.

## Installing the linters

The hook calls each binary directly (no `npx`-fetched fallback). Install whichever you want active.

macOS (Homebrew):

```sh
brew install ruff shellcheck yamllint ansible-lint
pnpm add -g oxlint
```

Debian / Ubuntu:

```sh
apt install -y shellcheck yamllint
uv tool install ruff # apt's ruff lags; uv tracks upstream
uv tool install ansible-lint
npm install -g oxlint
```

`ruff` via `uv tool install` on Debian/Ubuntu keeps it isolated from system Python and tracks the current release, whereas `apt install ruff` works on recent distros but ships an older build. `oxlint` is zero-config: it ships a full recommended ruleset built in and lints JS/TS/JSX standalone with no project-level config, so configless projects lint cleanly instead of erroring the way flat-config eslint does. A project `.oxlintrc.json` is still picked up from the file's directory if present.

## How the model sees the errors

A Write or an Edit has already run when the hook starts, so the hook cannot block it. It gives the errors to the model in the way each agent allows:

- **Claude Code:** the mod adds the errors to the `context` of the result. The model gets them with the result.
- **pi and omp:** the extension appends the errors to the result content and marks the result as an error.
- **Codex:** `command.ts` exits 2. A `PostToolUse` hook reaches the model only with exit code 2. With exit code 0, its output goes to the transcript only.

The hook reports only when a linter exits with a code other than 0. `oxlint` 1.87.0 reports its built-in rules as warnings, also a real bug such as an assignment to a `const`, and exits 0 for warnings. So the hook passes `--deny-warnings`, which makes oxlint exit 1 on a warning. A rule that a project `.oxlintrc.json` sets to `off` stays off. If a linter reports too much, change its severity, for example `shellcheck -S error`.

## Failure behavior

The hook fails open in every agent, so a broken lint run never changes the result:

- Claude Code skips a mod hook that throws, and the result stands.
- `pi.ts` catches its own errors.
- `command.ts` exits 1 on a bad payload. Only exit code 2 reaches the model.

## Dependencies

The mod needs Claude Code 2.1.296 or later, the oldest version tested. `pi.ts`, `command.ts`, and `apply-patch.ts` need Node 23.6 or later, which runs `.ts` files without a flag. The Codex entries start with `command -v node || exit 0`, so a machine without Node is not blocked.

Codex runs a hook only after you trust its entry. After the change from `hook.sh` to `command.ts`, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## Tests

`node test/check.ts` checks the core with stub I/O, `command.ts` with the real shellcheck, and the pi and mod adapters with stubs. `just hooks-check` runs it.

## Files

| File                                             | Deployed to `~/.claude/hooks/lint-code/` | Role                                                               |
| ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| `core.ts`                                        | Yes                                      | Finds the files, picks the linter, and runs it through an `Io`     |
| `hooks/register.ts`, `hooks/hooks.json`          | Yes                                      | Claude Code mod                                                    |
| `dot_claude-plugin/plugin.json`                  | Yes, as `.claude-plugin/plugin.json`     | Plugin manifest                                                    |
| `pi.ts`                                          | Yes                                      | pi and omp extension                                               |
| `command.ts`                                     | Yes                                      | Codex command hook                                                 |
| `io.ts`                                          | Yes                                      | The `Io` and the settings under Node, for `pi.ts` and `command.ts` |
| `config/dot_yamllint`, `config/dot_ansible-lint` | Yes, as `.yamllint` and `.ansible-lint`  | Linter configs                                                     |
| `README.md`, `test/`                             | No                                       | Kept in the repo by `.chezmoiignore`                               |
