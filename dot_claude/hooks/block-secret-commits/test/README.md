# Tests

## test.sh

End-to-end test for the two name-based checks in `../hook.sh`: the binary scan, and the `secret-filename` rule in `../conf/betterleaks.toml`.

Run it:

```bash
bash test.sh
```

Like `test-content.sh`, it cannot source the hook. Each case builds a throwaway git repo under `mktemp -d`, pipes a `PreToolUse` JSON payload into `../hook.sh` as a subprocess with `CLAUDE_PROJECT_DIR` pointed at that repo, and asserts the exit code: 0 allows, 2 blocks.

Six cases cover the binary scan, and they run unconditionally because that scan needs only git and bash. A newly added binary file must block, and the block message must name it. A binary named `we ird".p12` must block too, which is what proves the `-z` parsing survives a space and a quote. An ordinary text file must allow, because git can diff it and betterleaks can therefore read it. A modified tracked binary must allow, because `--diff-filter=A` covers added files only. Both allowlist forms must exempt a binary.

The fixtures embed a literal NUL byte. That is what makes git report the blob as binary, and it is the same test betterleaks uses to skip the file, so the equivalence the check rests on is exercised rather than assumed.

Five cases cover the name rule. One stages a file for each of the 35 sample names, asserts the commit blocks, and then asserts every one of those names appears in the block message, so a rule that silently stops matching cannot pass on the exit code alone. Add a name to the `names()` list whenever you tune the `path` pattern in `../conf/betterleaks.toml`. A second case stages the templates (`.env.example`, `.env.sample`, `.env.template`, `.env.dist`) together with ordinary files and the deliberately permitted `id_rsa.pub`, `server.crt`, and `notes.gpg`, and asserts they all pass. A third asserts `.claude-allow-secrets` exempts a secret name. A fourth asserts a repo carrying its own `.betterleaks.toml` keeps it, so the shipped rules stop applying.

These five skip if `betterleaks` or `jq` is missing, matching the hook's fail-open behavior; the binary cases have already run by then.

Run this file after any edit to `../conf/betterleaks.toml`. A config error is fatal to betterleaks rather than a warning, so a bad pattern makes the whole scan fail open with no visible sign.

## test-content.sh

End-to-end test for the betterleaks content check in `../hook.sh`, the `scan_content` function that blocks a secret value pasted into an ordinary file.

Run it:

```bash
bash test-content.sh
```

It cannot source the hook, because `scan_content` needs a real repo and a real payload. So each case builds a throwaway git repo under `mktemp -d`, pipes a `PreToolUse` JSON payload into `../hook.sh` as a subprocess with `CLAUDE_PROJECT_DIR` pointed at that repo, and asserts the exit code: 0 allows, 2 blocks.

The cases cover a staged secret on commit (blocks), the same secret on `git add` (allows, because the check is commit-only), clean staged content, an empty stage, an unstaged secret, a directory that is not a git repository (fails open), and an unrelated command.

Three cases guard the trigger filter, which decides whether a command counts as a commit. A `git add hooks/block-secret-commits/test` and a `git add .git/hooks/commit-msg` must allow: the word `commit` is inside a path, not the subcommand, and treating it as the subcommand runs the content check against an index the command has not written yet. `git -C . commit -m wip` must still block, because a `git` flag between the two words does not stop it from being a commit.

Four cases cover `git commit -a`, which stages tracked edits after the hook runs: `-am`, `-a -m`, `--all`, and a bare `-a` must each block on a secret sitting unstaged in a tracked file. Three more guard the flag test from the other side, because a false match costs an extra scan and can block a commit that carries no secret: the same repo without `-a` must allow, `git commit -m "add -a flag"` must allow because the `-a` there is message text and not a flag, and `git commit --allow-empty` must allow because it only looks like `--all`.

Four cases cover the allowlist: a file exempted by path, by bare basename, and through `CLAUDE_ALLOW_SECRETS` must all allow, and a second file that is not exempted must still block.

Five cases assert the text of the block message, not just the exit code. A broken report filter still exits 2, so the exit code alone cannot tell a useful block from one whose finding list failed to render. These assert that the message names the rule, file and line, that it carries the fingerprint for `.betterleaksignore`, that `jq` did not error while formatting, that the fix list offers `.betterleaksignore`, and that it marks `.claude-allow-secrets` as the last resort. The last two pin the order the fix list recommends, which the fingerprint assertion cannot see: that fingerprint comes from the finding line, not from the fix list.

Prints `ok`/`FAIL` per case and exits non-zero if any case fails.

If `betterleaks` or `jq` is missing the script prints `skip` and exits 0. That matches the hook's own fail-open behavior: the content check needs both tools, so with either one absent it does nothing and there is nothing to assert. The script also needs `jq` itself, to build payloads that contain quotes.

The secrets in the fixtures are randomly generated strings shaped like a GitHub token. They are not real credentials and match no live account.
