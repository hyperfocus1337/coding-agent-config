# lint-all-languages

A `PostToolUse` hook that lints each file Claude writes, dispatching by extension.

## How it works

Wired to `Write`, `Edit`, and `MultiEdit` in `settings.json`. It lints the edited file based on its extension:

| Extension                               | Linter                                           |
|-----------------------------------------|--------------------------------------------------|
| `.py`                                   | [ruff](https://docs.astral.sh/ruff/)             |
| `.js` `.jsx` `.ts` `.tsx` `.mjs` `.cjs` | [oxlint](https://oxc.rs/docs/guide/usage/linter) |
| `.sh` `.bash`                           | [shellcheck](https://www.shellcheck.net/)        |
| `.yml` `.yaml`                          | [ansible-lint](https://ansible.readthedocs.io/projects/lint/) if the file looks like Ansible, else [yamllint](https://yamllint.readthedocs.io/) |

A missing linter is a silent skip (the `command -v` check bails cleanly), so anything you do not install is a no-op. A lint failure exits 2, so Claude sees the errors and can fix them. The 5s timeout in `settings.json` caps runtime.

YAML is split: a file is treated as Ansible (and sent to `ansible-lint`, which runs yamllint internally) when it sits under a standard Ansible directory (`roles/`, `tasks/`, `handlers/`, `playbooks/`, `group_vars/`, `host_vars/`, `molecule/`), has an entrypoint name (`site.yml`, `playbook.yml`, `main.yml`, `requirements.yml`), or contains a top-level Ansible marker (`hosts:`, `tasks:`, `roles:`, `ansible.builtin.`). Everything else goes to `yamllint`.

## Installing the linters

The hook calls each binary directly (no `npx`-fetched fallback). Install whichever you want active.

macOS (Homebrew):

```sh
brew install ruff shellcheck yamllint ansible-lint
npm install -g oxlint
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
