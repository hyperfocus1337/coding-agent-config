# lint-code implementation

## Files and boundaries

`core.ts` selects files, discovers configurations, routes linters, and collects coverage notices. `io.ts` supplies file reads and process execution. `command.ts`, `pi.ts`, and `omp.ts` handle agent boundaries. `repository.ts` is the noninteractive full-repository entry point. The core has no Node imports.

The configuration files deploy under `~/.claude/hooks/lint-code/config/`, with chezmoi's `dot_` prefix changed to a leading dot. Source-tree execution also accepts the `dot_` names. README files, docs, and tests stay in the repository.

## File selection

Git returns NUL-separated paths, preserving spaces, newlines, and non-ASCII names. The changed-file check combines the diff against HEAD with untracked files. Before HEAD exists, it uses tracked and untracked files, so staged initial files are included. The explicit full check uses tracked and untracked files regardless of HEAD.

A set removes duplicate paths. Each selected file must have a supported extension and be a regular file. Stop hooks exclude temporary directories, including macOS `/private/tmp` and `$TMPDIR`; the explicit full check permits them. Selection failures produce coverage notices in stop hooks and fail the explicit command.

The diff includes pre-existing uncommitted work. A `shortcut:` comment names that limit and the upgrade to transcript-based tracking.

## YAML configuration and exclusions

Configuration discovery walks from the target file's directory to the Git root, nearest first. The selected configuration is passed with `-c`; YAML tools run from its directory with a relative filename. Without a project config, tools use their bundled fallback and run from the repository root. This avoids differences between path-based exclusions in nested and root-level checks.

The standalone fallback enables correctness rules only and uses `--strict` to make warnings actionable. ansible-lint gets the yamllint config with `--yamllint-file`, which comes first in its own search, and merges it over its embedded policy. Helm chart templates are excluded only when the corresponding chart has a `Chart.yaml`.

Ansible detection uses directory names or content markers, not generic entry-point names. The module marker accepts `ansible.builtin.copy:` and other builtin module names. It remains a heuristic; no YAML parser or schema dependency is added.

## Correction and final verification

Pi checks once at `agent_before_settle`. Errors request one continuation; notices alone do not. The handler preserves entries and continuation decisions from earlier handlers. `agent_settled` then runs report-only verification and resets state; `sendMessage` displays the report without triggering a new turn.

Claude Code and Codex use exit 2 for initial lint findings. On `stop_hook_active`, they rerun checks and exit 0, putting remaining findings in `systemMessage`. Omp similarly returns `continue: false` for report-only verification. No final report requests another correction. Other stop hooks can cause additional guarded stop events, each of which remains report-only.

## Process and coverage failures

Processes have a 30-second timeout. A missing executable returns no result. A timeout or signal returns a negative status, which the core treats as unavailable coverage, not as lint findings. Missing tflint plugins and mise version configuration also produce notices. Notices are deduplicated by tool and reason within each check.

Stop hooks fail open with visible notices. The explicit full check collects those same notices as failures. Adapter exceptions are reported without requesting correction; the explicit command exits nonzero. Command-hook configuration has a separate overall timeout, which can still terminate a large check before it reports.

Tflint runs in the module directory because its filter does not work with the previous `--chdir` approach. A module-local configuration wins over the bundled fallback. Ruff and oxlint retain their own configuration discovery.
