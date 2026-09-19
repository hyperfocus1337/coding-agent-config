# lint-all-languages

A `PostToolUse` and `PostToolUseFailure` hook that lints each file Claude writes, dispatching by extension.

## How it works

Wired to four entries in `settings.json`: `Write|Edit|MultiEdit` and `Bash` on `PostToolUse`, and `Bash` again on `PostToolUseFailure`. It dispatches on each file's extension to the matching linter:

| Extension                               | Linter                                                  | Invocation                                | Documentation                                              |
| --------------------------------------- | ------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `.py`                                   | [ruff](https://github.com/astral-sh/ruff)               | `ruff check --quiet`                      | https://docs.astral.sh/ruff/                               |
| `.js` `.jsx` `.ts` `.tsx` `.mjs` `.cjs` | [oxlint](https://github.com/oxc-project/oxc)            | `oxlint`                                  | https://oxc.rs/docs/guide/usage/linter                     |
| `.sh` `.bash`                           | [shellcheck](https://github.com/koalaman/shellcheck)    | `shellcheck -S warning`                   | https://www.shellcheck.net/wiki/                           |
| `.yml` `.yaml` (plain)                  | [yamllint](https://github.com/adrienverge/yamllint)     | `yamllint -c config/.yamllint`            | https://yamllint.readthedocs.io/                           |
| `.yml` `.yaml` (Ansible)                | [ansible-lint](https://github.com/ansible/ansible-lint) | `ansible-lint -c config/.ansible-lint -q` | https://ansible.readthedocs.io/projects/lint/              |
| `.tf` `.tfvars`                         | [terraform fmt](https://github.com/hashicorp/terraform) | `terraform fmt -check -diff`              | https://developer.hashicorp.com/terraform/cli/commands/fmt |

YAML routes to one of two linters (see [YAML routing](#yaml-routing) below). A missing linter is a silent skip (the `command -v` check bails cleanly), so anything you do not install is a no-op. A lint failure exits 2, so Claude sees the errors and can fix them. The timeouts in `settings.json` (10s on the edit matcher, 15s on each Bash matcher, which may lint several files) cap runtime.

## Bash (the paths the command just wrote)

A `Write` or `Edit` payload names the file in `tool_input.file_path`. A Bash payload names none, so a file a shell command wrote (`cat > setup.py <<'EOF'`, a `sed -i`, a redirect) reached no linter at all, and the error surfaced only when a later `Edit` happened to touch the same file.

So on the Bash matchers the hook reads the paths out of `tool_input.command`, the way [`format-org-tables`](../format-org-tables/README.md) does, and keeps the ones with a supported extension. A relative path resolves against the session cwd.

Naming a path is not the same as writing to it. `cat app.py` names it too, and blocking a read on an error that was already in the file helps nobody. So a named file is linted only when its mtime is within 120 seconds of the hook run, which is what separates a file the command wrote from a file it read. A command that writes early and then runs for minutes falls outside that window and is missed; the file is linted again on the next edit. The trade-off is marked with a `ponytail:` comment in `hook.sh`.

`PostToolUse` fires only after a tool call succeeds. A shell command that exits non-zero raises `PostToolUseFailure` instead, which is the write-then-verify pattern (`cat > setup.py <<'EOF' ... EOF && python setup.py`): the file is written, the command fails, and the write still needs linting. So the Bash matcher is wired to both events. [format-all-languages](../format-all-languages/docs/implementation.md#why-posttoolusefailure-is-wired-too) holds the measurement behind that.

Every target is linted before the hook exits, so one command reports every file it wrote instead of stopping at the first failure. Files under `/tmp`, `/var/tmp`, or `$TMPDIR` are skipped on both matchers: a scratchpad file is not project code, so a lint error there should not block a tool result.

`test/test.sh` covers both matchers: the block, the clean pass, the off switch, a path the command only read, a path named twice, two failing files in one command, and the temp-file skip.

## Turning linters off or tuning them

Set `CLAUDE_LINT_DISABLE` to a space/comma list of keys to skip: `py`, `js`, `sh`, `yaml`, `tf`, or `all` to disable the hook entirely. It reads the env at run time, so export it in your shell or set it in the hook's `settings.json` entry.

```sh
export CLAUDE_LINT_DISABLE="yaml"      # stop linting YAML
export CLAUDE_LINT_DISABLE="yaml,tf"   # skip YAML and Terraform
export CLAUDE_LINT_DISABLE="all"       # off
```

To _tune_ YAML rather than disable it, edit the bundled configs in [`config/`](config/); the hook passes them via `-c` on every invocation, so a repo's own `.yamllint` / `.ansible-lint` is ignored and there is nothing to copy per project:

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

## Why it blocks

The exit-2 block is deliberate, not an oversight. A `PostToolUse` hook only feeds its output back to Claude when it blocks (exit 2); on exit 0 the output goes to the user transcript, not to the model. A non-blocking lint hook would therefore be invisible to Claude, so lint findings would never get fixed, which defeats the point of running a linter on every edit. Blocking is the only way to surface a finding to the model.

Blocking on every stylistic nit would be too aggressive, but in practice it isn't, because the block is gated on the linter's own exit code. `oxlint` exits non-zero only on real correctness errors (redeclared bindings, syntax errors) and stays at exit 0 for style warnings, so the JS/TS path blocks on what's broken and merely prints the rest. If a linter feels too interrupty, tune its severity (for example `shellcheck -S error`) rather than dropping the exit-2, which would silence it entirely.
