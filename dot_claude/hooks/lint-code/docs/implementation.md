# lint-code implementation

## Files and boundaries

`core.ts` selects changed files and routes them to linters. `io.ts` supplies file reads and bounded process execution. `command.ts` handles Claude Code and Codex Stop payloads. `pi.ts` handles Pi's `agent_before_settle`; `omp.ts` handles omp's `session_stop`. There is no Claude Code mod and no per-tool lint adapter.

The config files are deployed under `~/.claude/hooks/lint-code/config/`, with chezmoi's `dot_` prefix changed to a leading dot. README files, docs, and tests stay in the repository.

## Changed paths

The hook resolves the git root from the session directory. NUL-separated git output preserves spaces, newlines, and non-ASCII names. A set removes duplicates between the tracked diff and untracked list. File modification times and shell-command parsing are not used.

Each retained path must have a supported extension and be a regular file on disk. Scratch paths are excluded. On macOS, both the path and `$TMPDIR` lose a leading `/private` before comparison. `$TMPDIR` matches a directory boundary, not an arbitrary prefix.

The git diff includes work from before the session. A `shortcut:` comment names the limit and the upgrade to transcript-based path tracking. Before the first commit, the diff against HEAD fails and only the untracked list contributes paths.

Linters run from the repository root unless they require a different directory. Tflint runs in the module folder: tflint 0.64.0 does not match the intended file with the previous `--chdir` approach. Its `--filter` keeps findings for each changed file.

## Pi boundary composition

Each handler returns the existing `event.entries` plus its own visible `custom_message`, with `continue: true`. Pi evaluates all handlers before it starts the next model request. Lint, tsc, and Pyrefly therefore contribute to one correction run, without calling `sendMessage`.

Each handler marks itself checked even when it passes or fails open. Later boundaries in the same activity skip it. The `agent_settled` notification resets the flag for the next activity. This prevents a type error introduced during lint correction from triggering another automatic correction run. The model must rerun relevant checks itself during correction.

Aborted or failed activities start no correction. Claude Code, Codex, and omp instead use `stop_hook_active` as their existing loop guard.

## Process handling

Each process is killed after 30 seconds. A timeout returns no result, rather than truncated diagnostics. Streams use UTF-8 decoding across chunks. Missing tools, missing tflint plugins, and mise shims without configured versions are skipped.

## Ansible markers

`isAnsible` matches `^\s*(- )?(hosts|tasks|roles|ansible\.builtin\.):` by line. The final branch requires a colon immediately after `ansible.builtin.`, so a module key such as `ansible.builtin.copy:` does not match. Path and entry-point detection remain unchanged.
