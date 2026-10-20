# Tests

`check.ts` is the end-to-end check for `../guard.sh`, `../command.ts`, and `../pi.ts`. Run it from the hook folder:

```sh
node test/check.ts
```

Each case builds a throwaway git repo in a temporary folder, runs `../guard.sh` as a child process, as Claude Code does, with a Bash payload on stdin and `CLAUDE_PROJECT_DIR` set to the repo, and checks the exit code: 0 allows, 2 blocks. It prints one `FAIL` line for each failed case, then `all pass` or the failure count, and exits 1 on a failure.

## Cases that run without betterleaks

- **A binary with no betterleaks on `PATH`** must block. This is the one check that never fails open.
- **An error in the binary scan** must block. The case gives the core a fake `Io` whose every call throws.
- **`guard.sh` with no `node`, and with a `node` that exits 1,** must block `git commit` and allow `ls -la`, `git add .git/hooks/commit-msg`, and `git commits`.

If betterleaks is missing, the check prints `skip` for the other cases.

## Binary scan

- An ordinary binary and a GIF must allow.
- A binary that holds a secret under the name `payload.dat` must block, and the message must name the file.
- A secret inside a `.png` and inside a `.pdf` must block. The default config exempts these extensions, so they block only because the hook scans a copy with a neutral name.
- A binary named `we ird".dat` must block, which proves that the `-z` parse keeps a space and a quote.
- A modified tracked binary must allow, because `--diff-filter=A` covers added files only.
- `.agent-allow-secrets` must exempt a binary.

The fixtures hold a NUL byte. That makes git report the blob as binary, which is the same test that betterleaks uses to skip the file, so the check exercises this match.

## Name rule

- One repo stages a file for each of the 39 secret names. The commit must block, and each name must appear in the message, so a rule that stops to match cannot pass on the exit code alone. Add a name to the `names` list when you change the `path` pattern in `../conf/betterleaks.toml`.
- The templates (`.env.example` and the others), ordinary files, `id_rsa.pub`, `server.crt`, and `notes.gpg` must allow.
- A repo with its own `.betterleaks.toml` keeps it, so the shipped name rule does not apply.

Run the check after each edit to `../conf/betterleaks.toml`. A config error stops betterleaks, and the scan then fails open with no sign.

## Content scan

- A staged secret blocks a commit, and does not block `git add`.
- `git add hooks/block-secret-commits/test` and `git add .git/hooks/commit-msg` must allow: `commit` in a path is not the subcommand. `git -C . commit` must block.
- Clean content, an empty stage, an unstaged secret, a folder that is not a repo, and an unrelated command must allow.
- The message must name the rule, file, and line, give the fingerprint, keep the secret value out, offer `.betterleaksignore`, and mark `.agent-allow-secrets` as the last resort, with the command that adds it to the exclude file of the repo.
- stdout must stay empty on a block and on an allow, because Codex reports any stdout as a failed hook.

## git commit -a

- `-am`, `-a -m`, `--all`, and a bare `-a` must each block on a secret in a tracked file that is not staged.
- The same repo must allow `git commit -m wip`, `git commit -m "add -a flag"`, and `git commit --allow-empty`.

## Allowlist

- A path, a basename, and `AGENT_ALLOW_SECRETS` must each exempt a content finding. The basename case also clears the `secret-filename` finding on `config/prod.env`.
- A second file that is not in the list must still block.

## pi.ts

A stub `pi` keeps the `tool_call` handler. A staged secret must return `{ block: true }` with the finding in the reason. Clean content and other tools must return nothing.

The secrets in the fixtures are random strings shaped like a GitHub token. They match no live account.
