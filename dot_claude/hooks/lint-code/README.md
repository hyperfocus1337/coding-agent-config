# lint-code

Checks changed and untracked source files when the agent is about to stop. Lint errors give the model one automatic correction opportunity. A final verification reports remaining failures without requesting another correction. Formatters still run after edits.

| Agent                 | Adapter                                                                                    | Loaded by                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Pi                    | `pi.ts`: `agent_before_settle` for correction, `agent_settled` for final verification      | `dot_pi/agent/modify_settings.json`                                       |
| omp                   | `omp.ts`: `session_stop`, report-only when `stop_hook_active` is true                      | `dot_omp/private_agent/private_config.yml`                                |
| Claude Code and Codex | `command.ts`: `Stop`, exit 2 for correction, exit 0 with `systemMessage` for final reports | `dot_claude/private_settings.json.tmpl` and `dot_codex/modify_hooks.json` |

## What it checks

The hook finds the Git repository root and checks supported regular files from the diff against HEAD and the untracked file list. This includes staged and unstaged work, including work from before the session. Before the first commit, staged and untracked files are checked. Deleted files, ignored untracked files, and files under `/tmp`, `/var/tmp`, or `$TMPDIR` are skipped. Outside Git, the stop hook does nothing.

| Extensions                                                   | Linter                                               |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `.py`                                                        | `ruff check --quiet`                                 |
| `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts` | `oxlint --deny-warnings`                             |
| `.sh`, `.bash`                                               | `shellcheck -S warning`                              |
| `.yml`, `.yaml`                                              | `yamllint --strict` or `ansible-lint -q`             |
| `.tf`                                                        | `tflint --filter=<file> --format=compact --no-color` |

`.tfvars` and prose are not checked. [`lint-prose`](../lint-prose/README.md) remains separate. YAML warnings fail the check because `--strict` makes warnings actionable.

### YAML policy and routing

The nearest project `.yamllint`, `.yamllint.yaml`, or `.yamllint.yml` wins. Ansible files use the nearest `.ansible-lint`, `.ansible-lint.yml`, `.ansible-lint.yaml`, `.config/ansible-lint.yml`, or `.config/ansible-lint.yaml`. Discovery starts in the file's directory and stops at the Git root. Without a project configuration, the bundled configuration applies, not a user-global configuration.

YAML tools run from the selected configuration directory, or the repository root for a fallback, with a relative target path. This makes project-relative exclusions apply. Source-tree commands also support chezmoi's `dot_` configuration filenames.

The bundled yamllint configuration checks syntax, duplicate keys, undeclared aliases, and ambiguous boolean values. It allows empty values and octal numbers and leaves style to oxfmt. Truthy keys are allowed because GitHub Actions uses `on:`. A project configuration can choose stricter or different rules.

Ansible detection uses directories (`roles/`, `tasks/`, `handlers/`, `playbooks/`, `group_vars/`, `host_vars/`, and `molecule/`) or content markers (`hosts:`, `tasks:`, `roles:`, and `ansible.builtin.<module>:`). Generic names such as `main.yaml`, `requirements.yaml`, and `site.yaml` alone are not evidence. Content detection is a heuristic, not a YAML schema check.

Files below a Helm chart's `templates/` directory are skipped when that chart has a `Chart.yaml`. Those files contain Go templates, not plain YAML. Other directories called `templates/` remain eligible. Project exclusions can skip other generated or templated files.

Ansible-lint has its own embedded yamllint policy. The standalone yamllint fallback is not injected into ansible-lint.

### Terraform

Tflint runs in the module directory, with `--filter` to keep findings for the selected file. A parse failure can still refer to the whole module. A module-local `.tflint.hcl` or `.tflint.json` wins over the bundled configuration. The hook does not install plugins.

## Full-repository check

Run from any target repository:

```sh
node ~/.claude/hooks/lint-code/repository.ts
```

Pass a directory to check another repository:

```sh
node ~/.claude/hooks/lint-code/repository.ts /path/to/repository
```

From this source repository, `just lint-code /path/to/repository` uses the same implementation. The full check includes clean tracked files and untracked files that Git does not ignore. It allows repositories in temporary directories. It does not modify files or request model work, so it can also run in CI.

The exit status is 0 only when selected checks pass. Lint errors, missing tools, timeouts, missing plugins, and selection failures return a nonzero status. Session and repository hook toggles do not disable an explicit full check; `CLAUDE_LINT_DISABLE` still selects which language checks are enabled. Only supported extensions are covered, not every file or language in the repository.

## Correction and verification

Initial lint errors instruct the model to fix errors and rerun checks. Missing tools, timeouts, and adapter exceptions instead produce coverage notices without requesting correction. Notices for the same unavailable tool and reason are deduplicated within a check.

Pi combines lint and type-check findings at the same boundary. It verifies after all automatic processing ends. Claude Code, Codex, and omp verify when `stop_hook_active` is true. Final failures are reports only, never another automatic correction request.

Other stop hooks can cause additional stop events; the command and omp adapters remain report-only on those events. Aborted Pi activities and aborted or failed omp activities do not start verification.

A clean verification produces no extra message. A report is not a guarantee of complete coverage when tools were unavailable. In Claude Code and Codex, final coverage notices and failures are surfaced with `systemMessage`.

## Requirements

Install the linters needed for the languages you check. Missing linters produce coverage notices in stop hooks and fail the full-repository command. Git is required; command adapters need Node 23.6 or later.

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

- **Session:** `/toggle-hook lint-code`, or `AGENT_HOOKS_DISABLE=lint-code` at launch.
- **Repository:** `/toggle-hook --repo lint-code`, or set Git config `agent-hook.lint-code.enabled` to `false`.
- **Language:** `CLAUDE_LINT_DISABLE` accepts `py`, `js`, `sh`, `yaml`, `tf`, or `all`, separated by spaces or commas.
- **Removal:** remove the adapter entry from the corresponding agent configuration.

## Failure behavior and tests

Processes have a 30-second timeout. Command-hook configuration also imposes an overall timeout, which can terminate a large changed-file check before it reports. Use the explicit full-repository command for broad checks without that hook-level limit.

Run `node test/check.ts` from this directory, or `just hooks-check` from the repository. Tests use Git and stand-in linters. See [testing](docs/testing.md) and [implementation](docs/implementation.md).
