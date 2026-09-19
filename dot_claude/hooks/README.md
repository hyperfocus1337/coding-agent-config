# hooks

Hooks are shell commands Claude Code runs on session lifecycle events, for example after every `Write`/`Edit`, before a `Bash` call, or when Claude finishes responding. Each hook is one directory here holding `hook.sh` and its own README. `settings.json` in the parent directory wires them to events and caps each one with a timeout.

| Hook                                                             | Event                                                         | Summary                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`format-all-languages`](format-all-languages/README.md)         | `PostToolUse` (Write/Edit, Bash), `PostToolUseFailure` (Bash) | Formats edited files with Prettier by extension; on Bash, re-aligns markdown tables in changed files. Needs `prettier`.         |
| [`format-org-tables`](format-org-tables/README.md)               | `PostToolUse` (Write/Edit, Bash), `PostToolUseFailure` (Bash) | Re-aligns Org tables in edited `.org` files via `emacs --batch`; on Bash, in the `.org` files the command names. Needs `emacs`. |
| [`lint-all-languages`](lint-all-languages/README.md)             | `PostToolUse` (Write/Edit)                                    | Lints the edited file by extension: ruff, oxlint, shellcheck, yamllint or ansible-lint, `terraform fmt`.                        |
| [`type-check-all-languages`](type-check-all-languages/README.md) | `Stop`                                                        | Type-checks the whole project once per turn, by the extensions git reports as changed: pyrefly, tsc.                            |
| [`block-secret-commits`](block-secret-commits/README.md)         | `PreToolUse` (Bash)                                           | Blocks a `git commit` that would add a secret: a betterleaks scan of the staged diff, plus a rescan of new binary files.        |
| [`enforce-cli-tools`](enforce-cli-tools/README.md)               | `PreToolUse` (Bash)                                           | Blocks a banned CLI tool in command position and names the replacement. Table-driven.                                           |

## Shared conventions

**A failed tool call still changed the disk.** `PostToolUse` fires only after a tool call succeeds; a shell command that exits non-zero raises `PostToolUseFailure`. A command that writes a file and then fails a check has still written the file, so the two formatting hooks are wired to both events. A hook that reports through `hookSpecificOutput` must echo `.hook_event_name` back rather than hardcode it, because `hookEventName` is the discriminant of a per-event schema.

**One file, or the whole project.** A hook that acts on the edited file runs on `PostToolUse` and reads `.tool_input.file_path`. A hook that reads the whole project runs on `Stop`, once per turn, because `PostToolUse` would rerun it after every edit and reprint the same unrelated errors each time. `Stop` carries no file path, so such a hook asks git what changed and reads `.stop_hook_active` to avoid blocking every stop.

**Fail open or fail closed, on purpose.** The advisory formatting hooks swallow failures and exit 0, so a hiccup never blocks a tool call. The lint, type-check, and secret-commit hooks exit 2 to surface the error or the block back to Claude.

**Self-disable when a tool is missing.** A hook checks for its linter, formatter, or scanner and exits 0 when the tool is absent, so a fresh machine is never blocked on an uninstalled dependency.

**Dependencies.** Every shell hook parses the payload with [`jq`](https://jqlang.github.io/jq/), so `jq` must be on `$PATH` (`brew install jq` on macOS). Per-hook tools are listed in the table above and installed as described in each hook's README.

**Per-repo escape hatches.** `block-secret-commits` reads `.claude-allow-secrets` and `.betterleaksignore`; `enforce-cli-tools` reads `.claude-allow-cli-tools`. Both also accept an environment variable for a one-off override. See the hook README for the exact names.

**Deliberate shortcuts** carry a `ponytail:` comment naming the ceiling and the upgrade path, matching the marker `rules/code.md` defines.
