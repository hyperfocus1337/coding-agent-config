# lint-code

Lints changed and untracked source files once when the agent is about to stop. The model gets the findings together and has one automatic correction opportunity. It does not receive lint output after each unfinished edit. Formatters still run after edits.

| Agent                 | Adapter                                                                     | Loaded by                                                         |
| --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Pi                    | `pi.ts`: `agent_before_settle` appends findings and requests a continuation | `dot_pi/agent/modify_settings.json`                               |
| omp                   | `omp.ts`: `session_stop` returns findings as `additionalContext`            | `dot_omp/private_agent/private_config.yml`                        |
| Claude Code and Codex | `command.ts`: `Stop`, exit 2 with findings on stderr                        | `dot_claude/settings.json.tmpl` and `dot_codex/modify_hooks.json` |

## What it checks

The hook finds the repository root, then reads `git diff --name-only -z --diff-filter=d HEAD` and `git ls-files -z --others --exclude-standard`. It checks each supported regular file once, including staged and unstaged changes. Deleted files, ignored untracked files, and files under `/tmp`, `/var/tmp`, or `$TMPDIR` are skipped. Outside git, nothing runs. Before the first commit, only untracked files count.

Git also reports uncommitted work from before the session. Such files can produce findings too. The hook does not track session-specific paths, and it does not check clean files elsewhere in the repository.

| Extensions                                                   | Linter and arguments                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `.py`                                                        | `ruff check --quiet`                                                    |
| `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts` | `oxlint --deny-warnings`                                                |
| `.sh`, `.bash`                                               | `shellcheck -S warning`                                                 |
| `.yml`, `.yaml`                                              | `yamllint -c <bundled config>` or `ansible-lint -c <bundled config> -q` |
| `.tf`                                                        | `tflint --filter=<file> --format=compact --no-color`                    |

`.tfvars` and prose are not checked. [`lint-prose`](../lint-prose/README.md) remains a separate per-edit hook.

### YAML routing

A file goes to ansible-lint when its path contains `roles/`, `tasks/`, `handlers/`, `playbooks/`, `group_vars/`, `host_vars/`, or `molecule/`; when its entry-point name is `site`, `playbook`, `main`, or `requirements`; or when its content matches the Ansible markers in `core.ts`. Other YAML goes to yamllint. Both use the bundled configurations, not repository configurations.

### Terraform

Tflint runs in the module folder, with `--filter` to keep findings for the changed file. A parse failure can still refer to the whole module. A module-local `.tflint.hcl` or `.tflint.json` wins over the bundled config. The hook does not install plugins.

## Correction and loop guard

All findings start with `Lint errors:` and end with instructions to fix the errors, rerun the relevant checks, and report remaining failures.

- **Pi:** lint and type-check handlers append to the same boundary entries, so their findings reach one correction run together. Each handler checks at most once until `agent_settled`, including when its initial check passes. No separate follow-up messages are queued.
- **Claude Code, Codex, and omp:** `stop_hook_active` lets the stop after a correction pass without another automatic check.
- **Pi and omp:** cancellation or an agent error starts no correction run.

This gives one automatic correction opportunity, not a guarantee of a clean result. The model must rerun checks itself during correction and report unresolved failures.

Claude Code uses a settings command hook, not a mod. See the [type-check design notes](../type-check-tsc/README.md#why-not-a-mod-in-claude-code) for the organization security restriction on Stop mods.

## Requirements

Install only the linters that you need. Missing linters are skipped. The hook also needs git; Claude Code and Codex need Node 23.6 or later to run `command.ts`.

```sh
uv tool install ruff
uv tool install ansible-lint
pnpm add -g oxlint
mise use -g tflint@0.64.0
```

Install shellcheck and yamllint through the platform package manager. Initialize bundled tflint plugins on each machine:

```sh
tflint --init --config ~/.claude/hooks/lint-code/config/.tflint.hcl
```

After a Codex hook entry changes, trust it again in the Codex TUI on each machine. See [Codex trust](../../../docs/agents/codex.md#trust).

## Settings

- **Session:** `/toggle-hook lint-code`, or set `AGENT_HOOKS_DISABLE=lint-code` at launch. Codex uses the environment variable.
- **Repository:** `/toggle-hook --repo lint-code`. Codex users can set `agent-hook.lint-code.enabled` to `false` in their repository git config.
- **Linter:** `CLAUDE_LINT_DISABLE` accepts `py`, `js`, `sh`, `yaml`, `tf`, or `all`, separated by spaces or commas. `all` also disables lint-prose.
- **Permanent removal:** remove the adapter entry from the configuration in the agent table.

The bundled files in `config/` set YAML and default Terraform rules. Ruff and oxlint retain their normal project configuration discovery. No rule severity or suppression is changed by this stop-time migration.

## Failure behavior and tests

Each process has a 30-second timeout; the Claude Code and Codex command hooks also have a 60-second total timeout. Missing binaries, missing tflint plugins, mise shims without a version, timeouts, and adapter exceptions fail open. A malformed JSON payload exits 1, which does not block the stop. Reported lint findings exit 2; a pass or skip exits 0 without output.

Run `node test/check.ts` from this directory, or `just hooks-check` from the repository. Tests use git and stand-in linters. See [testing](docs/testing.md) and [implementation](docs/implementation.md).
