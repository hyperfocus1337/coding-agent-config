# lint-code tests

Run `node test/check.ts` from `dot_claude/hooks/lint-code`, or `just hooks-check` from the repository. Tests need Node 23.6 or later, git, and sh. They use stand-in linters and need no installed Ruff, tsc, Pyrefly, shellcheck, or tflint.

Fixtures live under `$HOME` because lint-code skips scratch directories. Fixture commits disable git hooks for that command only. A `finally` block removes the fixtures. The test clears `AGENT_HOOKS_DISABLE` so it can check a hook disabled in the parent session.

## Coverage

- Each extension uses the existing linter arguments. YAML routing, Terraform module configuration, per-linter disable keys, and missing-tool behavior are preserved.
- Temporary paths are skipped, including macOS `/private/tmp` and custom `$TMPDIR` paths.
- Real git selection includes staged, unstaged, untracked, old-mtime, space-containing, newline-containing, and non-ASCII filenames. Deleted and ignored files are excluded.
- A clean repository starts no linter. A nested session directory still runs linters at the root. Outside git, nothing runs. Before the first commit, untracked files count.
- Stop payloads return exit 2 with all findings, or exit 0 for a loop guard, disabled hook, disabled linters, or repository disable key.
- Pi registers only `agent_before_settle` and `agent_settled`, not per-tool events. Lint, tsc, and Pyrefly handlers compose their findings into one boundary result. The correction boundary does not repeat checks, including a check that passed initially. Settlement resets the guards.
- Pi and omp skip aborted and failed runs. Omp registers only `session_stop` and respects `stop_hook_active`.

The type-check hooks also have their own adapter and command tests. `just hooks-check` type-checks the adapters against the installed Pi declarations and verifies that the two type-check implementations stay aligned.
