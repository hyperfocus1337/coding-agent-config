# Tests

## test.sh

Smoke test for the `is_dangerous` classifier in `../hook.sh`, the function that decides which filenames count as secrets that must never be committed.

Run it:

```bash
bash test.sh
```

It sources `../hook.sh` and calls `is_dangerous` directly. The hook defines the classifier at the top, then a sourcing guard (`[[ "${BASH_SOURCE[0]}" == "${0}" ]] || return 0`) stops before the hook body, so sourcing loads only the function without reading stdin or scanning the repo.

Each case asserts one basename: real secrets (`.env`, `id_rsa`, `*.pem`, `credentials.json`, ...) must block, templates and ordinary files (`.env.example`, `main.go`, ...) must pass. Prints `ok`/`FAIL` per case and exits non-zero if any case fails, so it doubles as a CI check. Add a case here whenever you tune the `is_dangerous` list.

## test-content.sh

End-to-end test for the betterleaks content check in `../hook.sh`, the `scan_content` function that blocks a secret value pasted into an ordinary file.

Run it:

```bash
bash test-content.sh
```

It cannot source the hook, because `scan_content` sits below the sourcing guard and needs a real repo and a real payload. So each case builds a throwaway git repo under `mktemp -d`, pipes a `PreToolUse` JSON payload into `../hook.sh` as a subprocess with `CLAUDE_PROJECT_DIR` pointed at that repo, and asserts the exit code: 0 allows, 2 blocks.

The cases cover a staged secret on commit (blocks), the same secret on `git add` (allows, because the check is commit-only), clean staged content, an empty stage, an unstaged secret, a directory that is not a git repository (fails open), and an unrelated command.

Three cases guard the trigger filter, which decides whether a command counts as a commit. A `git add hooks/block-secret-commits/test` and a `git add .git/hooks/commit-msg` must allow: the word `commit` is inside a path, not the subcommand, and treating it as the subcommand runs the content check against an index the command has not written yet. `git -C . commit -m wip` must still block, because a `git` flag between the two words does not stop it from being a commit.

Four cases cover `git commit -a`, which stages tracked edits after the hook runs: `-am`, `-a -m`, `--all`, and a bare `-a` must each block on a secret sitting unstaged in a tracked file. Three more guard the flag test from the other side, because a false match costs an extra scan and can block a commit that carries no secret: the same repo without `-a` must allow, `git commit -m "add -a flag"` must allow because the `-a` there is message text and not a flag, and `git commit --allow-empty` must allow because it only looks like `--all`.

Four cases cover the allowlist: a file exempted by path, by bare basename, and through `CLAUDE_ALLOW_SECRETS` must all allow, and a second file that is not exempted must still block.

Three cases assert the text of the block message, not just the exit code. A broken report filter still exits 2, so the exit code alone cannot tell a useful block from one whose finding list failed to render. These assert that the message names the rule, file and line, that it carries the fingerprint for `.betterleaksignore`, and that `jq` did not error while formatting.

Prints `ok`/`FAIL` per case and exits non-zero if any case fails.

If `betterleaks` or `jq` is missing the script prints `skip` and exits 0. That matches the hook's own fail-open behavior: the content check needs both tools, so with either one absent it does nothing and there is nothing to assert. The script also needs `jq` itself, to build payloads that contain quotes.

The secrets in the fixtures are randomly generated strings shaped like a GitHub token. They are not real credentials and match no live account.
