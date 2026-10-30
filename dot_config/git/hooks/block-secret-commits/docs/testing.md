# Testing

[`test/check.ts`](../test/check.ts) is the end-to-end check for `main.ts` and the hook command. Run it from the hook folder:

```sh
node test/check.ts
```

`just hooks-check` runs it with the checks of the other hooks.

Run the check after each change to the hook, and after each edit to `conf/betterleaks.toml`. A config error stops betterleaks, and the scan then fails open with no sign. A passing check is the only proof that the name rules still load.

## What it needs

- **Node 23.6 or later**, which runs `.ts` files without a flag.
- **git** with config-based hooks, to build the throwaway repos and run the commits.
- **betterleaks** on `PATH`, for most cases. Without it, the check runs only the cases in [Cases that run without betterleaks](#cases-that-run-without-betterleaks) and prints one `skip` line for the others.

## How it runs

The check reads the hook command from [`dot_config/git/config`](../../../config) and sets it through `GIT_CONFIG_*` variables, with `GIT_CONFIG_GLOBAL=/dev/null`. `HOME` is a temporary folder that links to this hook folder, so the check runs this source and not the deployed copy.

Each case builds a throwaway git repo in a temporary folder and runs a real `git commit`. Then it checks whether the commit blocked, and for some cases the block message on stderr.

The check prints one `FAIL` line for each failed case, then `all pass` or the failure count. It exits 1 on a failure.

The secrets in the fixtures are random strings shaped like a GitHub token. They match no live account.

## Cases that run without betterleaks

- **A binary with no betterleaks on `PATH`** must block. The binary scan never fails open on a missing scanner.
- **No `node` on `PATH`** must block, with a message that names `node 23.6 or later`. **A `node` that exits 1** must block too. Each of these `PATH` values holds a link to the git of the test, so the hook still runs.
- **An error in the binary scan** must block. A git shim fails the staged diff, and the real hook must report that it could not list the binaries. `GIT_EXEC_PATH` selects the shim because git prepends that directory to the hook's `PATH`.

## Binary scan

- An ordinary binary and a GIF must allow.
- A binary that holds a secret under the name `payload.dat` must block, and the message must name the file.
- A secret in a `.png` and in a `.pdf` must block. The default config exempts these extensions, so they block only because the hook scans a copy with a neutral name.
- Binaries with spaces, quotes, newlines, and a leading colon in their names must block. This checks NUL-delimited parsing and index-blob addressing.
- A staged binary secret must block after a clean worktree replacement, removal, or symlink replacement. A clean staged blob must allow despite a worktree secret or worktree removal.
- A path-only commit must allow when a staged binary secret is outside its temporary index. A subsequent commit of that binary must block.
- A binary secret must block on the first commit, with no `HEAD` yet.
- A failed blob export must block. A git shim fails only `git cat-file blob`.
- A binary above 100 MiB must block, including under an extension that betterleaks normally exempts. An explicit allowlist entry must still allow it.
- A modified tracked binary must allow, because `--diff-filter=A` covers added files only.
- `.agent-allow-secrets` must exempt a binary.

The fixtures hold a NUL byte. git then reports the blob as binary, which is the same test that betterleaks uses to skip the file, so the check exercises this match.

## Name rule

- One repo stages a file for each of the 39 secret names. The commit must block, and each name must appear in the message, so a rule that stops to match cannot pass on the exit code alone. Add a name to the `names` list when you change the `path` pattern in `conf/betterleaks.toml`.
- The templates (`.env.example` and the others), ordinary files, `id_rsa.pub`, `server.crt`, and `notes.gpg` must allow.
- A repo with its own `.betterleaks.toml` keeps it, so the shipped name rule does not apply.

## Content scan

- A staged secret must block.
- Clean content, an empty commit, and an unstaged secret must allow.
- The message must name the rule, file, and line, and give the fingerprint. It must keep the secret value out, offer `.betterleaksignore`, and mark `.agent-allow-secrets` as the last resort, with the command that adds it to the exclude file of the repo.

## Commits that stage for themselves

- `git commit -am`, `git commit --all -m`, and `git commit -m wip app.py` must each block on a secret in a tracked file that is not staged. Git gives the hook the temporary index of these commits.
- The same repo must allow `git commit --allow-empty -m wip`, because the change is not part of that commit.

## Allowlist

- A path, a basename, and `AGENT_ALLOW_SECRETS` must each exempt a content finding. The basename case also clears the `secret-filename` finding on `config/prod.env`.
- A second file that is not in the list must still block.
