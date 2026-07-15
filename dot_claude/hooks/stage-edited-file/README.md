# stage-edited-file

A `PostToolUse` hook that runs `git add` on each file Claude writes, so every edit lands pre-staged in `git status`.

## How it works

Wired to `Write`, `Edit`, and `MultiEdit` in `settings.json`. It reads the edited file path from the tool payload and stages it. It follows the swallow-and-exit-0 contract: it gates on `tool_response.success` (skips failed tool calls), prefers `$CLAUDE_PROJECT_DIR` for the repo root, self-disables if `jq` is missing, and skips paths outside a git repo. The 5s timeout in `settings.json` caps worst-case runtime.

It skips secret-shaped filenames (`.env`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`) so credentials are never auto-staged.

Note: it re-stages the whole file even if you had a partial `git add -p` selection.

## Dependencies

Parses the JSON payload with [`jq`](https://jqlang.github.io/jq/), so `jq` must be on `$PATH` (`brew install jq` on macOS).
