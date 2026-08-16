# block-secret-commits

A `PreToolUse` hook that blocks `git add` and `git commit` commands which would commit a secret. It runs two checks: a filename check that catches secret files (`.env`, `.envrc`, private keys, credential blobs) which are not gitignored, and a content check that catches a secret value pasted into an ordinary file. It is a safety net for accidental `git add .`, not a replacement for a good `.gitignore`.

## Requirements

The filename check needs nothing beyond git. The content check needs [betterleaks](https://github.com/betterleaks/betterleaks) on `$PATH`, and without it that check silently does nothing:

```sh
brew install betterleaks # macOS
go install github.com/betterleaks/betterleaks@latest # any platform with Go
```

Or drop a release binary on `$PATH`, which is what the devcontainer needs (no Homebrew, no Go toolchain):

```sh
mkdir -p ~/.local/bin
curl -sL https://github.com/betterleaks/betterleaks/releases/download/v1.7.4/betterleaks_1.7.4_linux_arm64.tar.gz | tar xz -C ~/.local/bin betterleaks
```

Check the [releases page](https://github.com/betterleaks/betterleaks/releases) for the current version and your architecture, because the version appears in both the tag and the filename.

The content check also needs `jq`, which is normally already installed. It reads the command out of the hook payload and the file names out of the betterleaks report. Without `jq` the content check does nothing, the same as a missing binary. `jq` is required rather than optional because the allowlist filter runs on the report: a partial run would still block a file listed in `.claude-allow-secrets`, which contradicts the escape hatch the block message names.

## How it works

The hook is wired to the `Bash` tool in `settings.json`, so it runs before every shell command. It exits immediately unless the command text contains `git add` or a `git ... commit`, so the cost on ordinary commands is a single fast bail (about 1ms of process startup, no external tools spawned).

`commit` is matched as a word of its own, with whitespace in front and no word character after. Otherwise a path such as `hooks/block-secret-commits/` or `.git/hooks/commit-msg` reads as the subcommand, and a `git add` on that path runs the commit-only content check below against an index the command has not written yet. `git` and `commit` are matched apart, because flags sit between them in `git -C /tmp commit`.

### Filename check

When the hook does see one of those commands, it lists everything git would actually track with `git ls-files --cached --others --exclude-standard`. That set is tracked files plus untracked-but-not-ignored files, and it deliberately excludes anything gitignored. So a properly gitignored `.env` is silently allowed, because git could never stage it anyway, and gitignore is the natural first escape hatch. Each basename is checked against the ruleset; if any match, the command is blocked with exit code 2 and a message naming the offending files.

The scan covers the whole repo rooted at `CLAUDE_PROJECT_DIR`, not just the paths in this particular command. That is intentional: a non-ignored secret anywhere in the repo blocks the add or commit. The trade-off is that a stray non-ignored secret nags on every `git add`/`git commit` until you gitignore it or override.

### Content check

A filename rule cannot see an API key pasted into `app.py`, so the `scan_content` function passes the staged content to [betterleaks](https://github.com/betterleaks/betterleaks), a fork of gitleaks with the same rule set and config format. It runs `betterleaks git --staged`, which scans the index against `HEAD`, so it reads only what this commit would add. A finding blocks with exit code 2 and a message naming the rule, the file, the line, and the fingerprint. `--redact` keeps the secret value out of the report, the hook output, and the model's context.

The check runs on `git commit` only, not on `git add`. At `git add` time the index does not yet hold the files being added, so a staged scan would find nothing. By commit time it does, because the git slash commands stage and commit in the same response, so their `git add` has already run.

#### `git commit -a`

`-a` stages tracked modifications as part of the commit itself, after the hook has run, so the index the hook reads does not hold them yet. To cover that, the hook checks whether the command carries `-a` or `--all`, and if it does and the staged scan came back clean, it runs a second scan with `betterleaks git --pre-commit`, which reads the unstaged tracked diff. Both scans have to be clean for the commit to proceed.

The flag test truncates the command at `-m` or `--message` first, so `git commit -m "add -a flag"` is not mistaken for an `-a` commit. A message glued straight to the flag (`-m"..."`) defeats that and costs one extra scan, which can block on a working-tree secret the commit would not have included. `--all` is matched with an anchor on both sides, so `--allow-empty` does not read as `--all`.

#### When the scan cannot run

The check fails open on every path except a real finding. If betterleaks or `jq` is missing, the directory is not a git repository, or betterleaks itself errors, the command is allowed and the filename check above still applies. The hook passes `--exit-code 9` so that "leaks found" is distinct from betterleaks' own error exit of 1, which is what makes a broken scan allow instead of blocking every commit.

Each scan is wrapped in `timeout 4`. A large high-entropy staged blob otherwise runs far past any sane hook budget: about 26 MB of base64 takes 7 s and about 104 MB takes 41 s. Ordinary source is nowhere near that, at 2 s for 20 MB of code, so only generated or encoded content reaches the cap. Without the wrapper the hook itself is killed by the `settings.json` timeout and exits 124, which Claude Code reads as an error rather than as a block, so the scan caps itself instead. `--max-target-megabytes` does not help here: it governs `dir` scans, not git blobs.

A capped scan allows the commit, in line with the rest of the fail-open behavior, but it is the one fail-open path a reader cannot infer from a clean run, so it prints a warning to stderr naming the command to run by hand. To fail closed on a capped scan instead, change that branch to block.

The `settings.json` timeout is 10 s, which covers the worst case of two capped scans on an `-a` commit plus the filename scan.

#### `git commit --amend`

`--amend` with an empty index rewrites content that is already in `HEAD`, which a staged scan does not read. That content was scanned when it was first committed, so the gap only matters if the original commit predates this hook.

### Cost

Measured on the installed hook, median of 9 runs:

| Command                                       | Hook cost |
| --------------------------------------------- | --------- |
| any non-git command                           | 2 ms      |
| `git add`                                     | 12 ms     |
| `git commit`, clean 1000-line staged diff     | 42 ms     |
| `git commit -am`, clean (runs both scans)     | 68 ms     |
| `git commit`, secret found                    | 70 ms     |
| `git commit`, staged content past the 4 s cap | 4040 ms   |

betterleaks costs about 35 ms of fixed startup plus about 0.18 ms per KB of staged diff. A 50000-line (3.5 MB) diff scans in 656 ms, well inside the 5 s hook timeout in `settings.json`.

## The filename ruleset

The patterns live in the `is_dangerous` function in `hook.sh`. It takes a basename and returns 0 to block or 1 to allow. The allowlist arm is checked first so template files like `.env.example` pass even though they match the `.env.*` blocklist. Edit the case arms there to tune what counts as a secret.

The list is deliberately **filename-based**, not content-based. The key-file names and extensions (ssh/rsa keys, `*.p8`, `*.pkcs8`, `*.pfx`, `*.p12`, keystores, and so on) are drawn from the key-file categories in GitLab's [secret-detection-rules](https://gitlab.com/gitlab-org/security-products/secret-detection/secret-detection-rules/-/tree/main/rules/mit), plus common credential files (`.netrc`, `.pgpass`, `.htpasswd`, `.git-credentials`, `.dockercfg`). That upstream ruleset is otherwise a set of content regexes (matching secret _values_ like `sk-...` or `AKIA...` inside files); those cannot be expressed as a cheap basename check, which is why the content check delegates them to betterleaks instead. Encrypted blobs (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) are intentionally not blocked, since committing those is a legitimate workflow.

## Overrides for the filename check

The filename check offers three escape hatches. The first drops a file from the scan entirely; the other two exempt named files while keeping the guard active for the rest, and both of those also exempt the file from the content check.

**1. gitignore (preferred).** If the file is gitignored, the hook never sees it, because the scan uses `--exclude-standard`. This is the right answer almost every time: a secret that should never be committed belongs in `.gitignore`, and then the hook stays silent with no override needed. Reach for the two explicit overrides below only when you genuinely intend to commit a secret-shaped file (an encrypted env, a fixture, a template that happens to match a pattern).

**2. Per-repo allowlist file.** Create a `.claude-allow-secrets` file in the repo root listing the secret file(s) you intend to commit, one per line. An entry matches either a repo-relative path or a bare basename, and `#` comments and blank lines are ignored:

```sh
# .claude-allow-secrets
config/prod.env      # only this exact path
test/fixtures/id_rsa # a key fixture
.pgpass              # bare basename: any file named .pgpass, anywhere
```

Only the listed files are exempted; every other secret still blocks. It is persistent and survives across sessions, and because it lives in the repo you can commit it so the whole team inherits the exemption. Use it when a repo legitimately and repeatedly tracks specific secret-shaped files.

**3. Environment variable.** Set `CLAUDE_ALLOW_SECRETS` to the file(s) to exempt, whitespace- or colon-separated, using the same path-or-basename matching:

```sh
CLAUDE_ALLOW_SECRETS=config/prod.env:.pgpass
```

This exempts just those files wherever the variable is exported, so it is best for a one-off or session-scoped skip that leaves no trace in the repo. Export it in your shell for the rest of a session, or prefix a single command. Any secret not named still blocks.

Both overrides are additive and file-scoped, not all-or-nothing: they exempt only the paths you name and leave the guard active for everything else. Gitignore (override 1) remains the right answer for a secret that should never be committed at all.

## Overrides for the content check

The content check uses the standard betterleaks escape hatches, so a repo that already carries a gitleaks config keeps working unchanged.

**1. `.claude-allow-secrets` and `CLAUDE_ALLOW_SECRETS`.** The filename allowlist above also exempts the content check. A file listed there is dropped from the findings before the hook decides, by path or by bare basename, using the same matching. Use it when a repo legitimately tracks a file that is full of secret-shaped values: one entry covers both checks instead of one entry plus a fingerprint. Every file not listed still blocks.

**2. Remove the secret.** A finding is usually correct. Move the value to an environment variable or a gitignored file, restage, and commit.

**3. Inline comment.** Put a `betterleaks:allow` comment on the flagged line. `gitleaks:allow` also works. Use it for a value that looks like a secret but is not, such as a test fixture or a documented example key.

**4. Ignore file.** Add the fingerprint from the block message to `.betterleaksignore` in the repo root, one per line. A fingerprint is `file:rule:line`, so `app.py:generic-api-key:42`. `.gitleaksignore` also works. Use it when the finding is a false positive that no comment can carry, such as one inside generated or binary content.

**5. Custom rules.** Drop a `.betterleaks.toml` or `.gitleaks.toml` in the repo root to tune the rule set for that repo, or point `BETTERLEAKS_CONFIG` at a shared config. The hook passes no `--config`, so the standard precedence applies.

The default rule set already allowlists well-known documentation values, so the canonical AWS example key `AKIAIOSFODNN7EXAMPLE` does not block a commit.

## Tests

`test/test.sh` is a smoke test for the `is_dangerous` classifier: it sources `hook.sh` (stopping at the sourcing guard so only the function loads) and asserts that real secrets block and templates/ordinary files pass. Run `bash test/test.sh`.

`test/test-content.sh` is an end-to-end test for the content check: it builds throwaway repos, pipes a hook payload into `hook.sh`, and asserts the outcome for a staged secret, clean content, an empty stage, a `git add`, a non-repo, an unrelated command, the four `-a` spellings, a `-a` that appears only inside the commit message, `--allow-empty`, a `git add` whose path holds the word `commit`, `commit` behind a `git` flag, each allowlist form, and the text of the block message. Run `bash test/test-content.sh`. It skips with exit 0 if betterleaks or `jq` is missing.

See [test/README.md](test/README.md).

## Files

- `hook.sh` is the whole hook, invoked from `settings.json`. It deploys via chezmoi to `~/.claude/hooks/block-secret-commits/`.
- `test/test.sh` is the classifier smoke test, run by hand or in CI (see [Tests](#tests)).
- `test/test-content.sh` is the content-check end-to-end test (see [Tests](#tests)).
