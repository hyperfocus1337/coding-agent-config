# stage-edited-file

A `PostToolUse` hook that runs `git add` on each file Claude writes, so every edit lands pre-staged in `git status`.

## How it works

Wired to `Write`, `Edit`, and `MultiEdit` in `settings.json`. It reads the edited file path from the tool payload and stages it. It follows the swallow-and-exit-0 contract: it gates on `tool_response.success` (skips failed tool calls), prefers `$CLAUDE_PROJECT_DIR` for the repo root, self-disables if `jq` is missing, and skips paths outside a git repo. The 5s timeout in `settings.json` caps worst-case runtime. Note: it re-stages the whole file even if you had a partial `git add -p` selection.

It skips secret-shaped filenames (env files, private keys, keystores, credential blobs) so credentials are never auto-staged. The classifier lives in `../_shared/secret-filenames.sh` and is shared with the block-secret-commits hook, so both agree on what counts as a secret; edit the list there. This check runs after the gitignore guard, so a gitignored secret is still unstaged rather than silently left alone.

## Gitignore guard

Gitignored files must never end up staged by this hook. Before staging, it runs `git check-ignore --no-index` and, if the path matches an ignore rule, unstages it (`git restore --staged`) and bails instead of adding it. This guards three cases:

- Fresh gitignored file: plain `git add` already skips it, but the guard makes the intent explicit.
- Gitignored file that was force-staged earlier (`git add -f`): the guard unstages it. `--no-index` is required here, because without it `check-ignore` skips paths already in the index and the file would slip straight through to `git add`.
- File committed before it was gitignored, then edited: the guard unstages the new edit. The file stays tracked and the edit is preserved in the working tree; only the staging is removed. This is an anomaly (a tracked file that now matches an ignore rule), so the hook additionally emits a non-blocking `hookSpecificOutput.additionalContext` note on stdout (exit 0) so Claude can raise it with you, e.g. suggesting `git rm --cached` to stop tracking it. The other two cases stay silent.

## Dependencies

Parses the JSON payload with [`jq`](https://jqlang.github.io/jq/), so `jq` must be on `$PATH` (`brew install jq` on macOS).
