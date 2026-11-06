# lint-code tests

Run `node test/check.ts` from `dot_claude/hooks/lint-code`, or `just hooks-check` from the repository. Tests need Node 23.6 or later, git, and sh. They use stand-in linters and need no installed Ruff, tsc, Pyrefly, shellcheck, or tflint.

Fixtures live under `$HOME` because lint-code skips scratch directories. Fixture commits disable git hooks for that command only. A `finally` block removes the fixtures. The test clears `AGENT_HOOKS_DISABLE` so it can check a hook disabled in the parent session.

## Coverage

- YAML configuration discovery checks each supported filename, nearest-first selection, and the repository boundary. Ansible configuration, builtin module detection, generic basenames, and Helm exclusions are covered.
- The fallback policy limits lines to 100 characters and leaves other formatting to oxfmt. Missing tools and timeouts emit one coverage notice per tool and reason; a full check treats unavailable coverage as failure.
- Terraform module configuration and per-linter disable keys remain covered.
- Temporary paths are skipped, including macOS `/private/tmp` and custom `$TMPDIR` paths.
- Real git selection includes staged, unstaged, untracked, old-mtime, space-containing, newline-containing, and non-ASCII filenames. Deleted and ignored files are excluded.
- A clean repository starts no linter. A nested session directory still runs linters at the root. Outside git, nothing runs. Before the first commit, staged and untracked files count. The explicit full-repository command includes clean tracked files.
- Stop payloads return exit 2 with initial findings. Guarded stops rerun checks and report remaining errors through `systemMessage` with exit 0. Disabled hooks, disabled linters, and repository disable keys still skip automatic checks.
- Pi registers only `agent_before_settle` and `agent_settled`, not per-tool events. Lint, tsc, and Pyrefly handlers compose their findings into one boundary result. The correction boundary does not repeat checks, including a check that passed initially. Settlement runs final verification without requesting continuation, then resets the guards.
- Pi and omp skip aborted and failed runs. Omp registers only `session_stop` and uses `stop_hook_active` for report-only final verification.

The type-check hooks also have their own adapter and command tests. `just hooks-check` type-checks the adapters against the installed Pi declarations and verifies that the two type-check implementations stay aligned.
