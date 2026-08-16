# block-secret-commits

A `PreToolUse` hook that blocks a `git commit` which would commit a secret. It runs two checks: a **binary scan** that blocks a newly added file the secret scanner cannot read, and a **betterleaks scan** that catches both a secret value pasted into an ordinary file and a file whose name alone marks it as a secret. It is a safety net for an accidental `git add .`, not a replacement for a good `.gitignore`.

This file describes what the hook does and how to work around it. For why it is built this way, including the measurements behind each decision and the alternatives that were tested and rejected, see [docs/implementation.md](docs/implementation.md).

## Requirements

The binary scan needs nothing beyond git and bash. The betterleaks scan needs [betterleaks](https://github.com/betterleaks/betterleaks) on `$PATH`, and without it that scan silently does nothing:

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

The betterleaks scan also needs `jq`. Without it that scan does nothing, the same as a missing binary.

## What it does

The hook is wired to the `Bash` tool in `settings.json`, so it runs before every shell command. It exits immediately unless the command is a `git ... commit`, so an ordinary command costs about 1 ms.

### Commit only, not `git add`

Both checks read the index. The hook runs before the command it guards, so at `git add` time the index does not yet hold the files being added. Staging a secret is therefore not blocked at the moment of the `git add`; the commit that would act on it is. Nothing reaches a commit either way.

### Binary scan

betterleaks cannot read a binary blob in git mode, so a keystore, a key bundle, or a database dump would otherwise reach the commit unread. The hook blocks any **newly added** binary file, which is exactly the set the betterleaks scan cannot check.

A modified tracked binary is not blocked, because it was checked when it was first added and updating a committed image or font is routine. The trade-off is that swapping a secret into an already-tracked binary is not caught.

This scan is git and bash only. It is the one check that still runs when betterleaks is missing.

### betterleaks scan

The hook runs `betterleaks git --staged`, which scans the index against `HEAD`, so it reads only what this commit would add. Two kinds of finding block, and the block message says which is which:

- **a content rule** matched a secret value on a line, for example `generic-api-key` or `github-pat`;
- **the `secret-filename` rule** matched the file name alone.

A finding blocks with exit code 2 and a message naming the rule, the file, the line, and the fingerprint. `--redact` keeps the secret value out of the report, the hook output, and the model's context.

The name rule exists because a content rule matches secret _values_, and so cannot flag a `.pgpass` or a `.netrc`, which hold a human-chosen password with no entropy and no vendor prefix. See [the measurements](docs/implementation.md#content-scan).

### `git commit -a`

`-a` stages tracked modifications after the hook has run, so the index the hook reads does not hold them yet. When the command carries `-a` or `--all` and the staged scan is clean, the hook runs a second scan over the unstaged tracked diff. Both have to be clean for the commit to proceed.

A message glued straight to the flag (`git commit -m"..."`) can cost one extra scan, which may block on a working-tree secret the commit would not have included.

### `git commit --amend`

`--amend` with an empty index rewrites content already in `HEAD`, which a staged scan does not read. That content was scanned when it was first committed, so the gap only matters if the original commit predates this hook.

### Scope: staged files only

Both checks read the index, so they see only what the commit would add. A secret-shaped file sitting untracked in the working tree does not block an unrelated commit. It blocks the commit that actually stages it.

### When a check cannot run

The betterleaks scan **fails open**: a missing `betterleaks` or `jq`, a directory that is not a git repository, a scanner error, a config that fails to parse, or a scan past its 4 s cap all allow the commit. Only a real finding blocks. The binary scan is unaffected and keeps running.

A capped scan prints a warning to stderr naming the command to run by hand. It is the one fail-open path you cannot infer from a clean run.

A config error is fatal to betterleaks rather than a warning, so a typo in `conf/betterleaks.toml` disables the whole scan silently. **Run `bash test/test.sh` after editing that file.**

### Cost

About 1 ms on a non-git command, 2 ms on a blocked binary, and 46 ms on a clean 1000-line staged diff. Full table in [docs/implementation.md](docs/implementation.md#cost).

## The name ruleset

The names live in the `secret-filename` rule in [`conf/betterleaks.toml`](conf/betterleaks.toml). Edit the `path` pattern there to tune what counts as a secret.

Encrypted blobs (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) are deliberately not matched, since committing those is a legitimate workflow.

Before editing the pattern, read [Rule dialect](docs/implementation.md#rule-dialect). Patterns are Go RE2, which has no lookahead, and an invalid pattern disables the scan silently rather than erroring visibly. [Name ruleset provenance](docs/implementation.md#name-ruleset-provenance) records where the list came from.

### Per-repo configs

The hook passes `--config` only when the repo defines no config of its own and no config environment variable is set. A repo carrying a `.betterleaks.toml` or `.gitleaks.toml` keeps winning. Such a repo keeps the content rules and loses the name rules; its config can extend this file to get them back:

```toml
[extend]
path = "~/.claude/hooks/block-secret-commits/conf/betterleaks.toml"
```

The shipped config sets `[extend] useDefault = true`, so the upstream rules and their allowlist still apply and the canonical AWS example key `AKIAIOSFODNN7EXAMPLE` does not block a commit.

## Overrides

### 1. gitignore (preferred)

If the file is gitignored, git never stages it, so neither check ever sees it. This is the right answer almost every time: a secret that should never be committed belongs in `.gitignore`, and then the hook stays silent with no override needed. Reach for the explicit overrides below only when you genuinely intend to commit a secret-shaped or binary file.

### 2. Per-repo allowlist file

Create a `.claude-allow-secrets` file in the repo root listing the file(s) you intend to commit, one per line. An entry matches either a repo-relative path or a bare basename, and `#` comments and blank lines are ignored:

```sh
# .claude-allow-secrets
config/prod.env      # only this exact path
test/fixtures/id_rsa # a key fixture
.pgpass              # bare basename: any file named .pgpass, anywhere
assets/logo.ico      # a binary the binary scan would otherwise block
```

One entry exempts the file from **every** check: the binary scan, the `secret-filename` rule, and the content rules. Only the listed files are exempted; everything else still blocks. It is persistent, survives across sessions, and because it lives in the repo you can commit it so the whole team inherits the exemption.

### 3. Environment variable

Set `CLAUDE_ALLOW_SECRETS` to the file(s) to exempt, whitespace- or colon-separated, using the same path-or-basename matching and covering the same checks:

```sh
CLAUDE_ALLOW_SECRETS=config/prod.env:.pgpass
```

This is best for a one-off or session-scoped skip that leaves no trace in the repo.

### 4. betterleaks escape hatches

For a content finding only, the standard betterleaks escape hatches also work, so a repo that already carries a gitleaks config keeps working unchanged:

- **Inline comment.** Put a `betterleaks:allow` comment on the flagged line. `gitleaks:allow` also works. Use it for a value that looks like a secret but is not, such as a test fixture or a documented example key.
- **Ignore file.** Add the fingerprint from the block message to `.betterleaksignore` in the repo root, one per line. A fingerprint is `file:rule:line`, so `app.py:generic-api-key:42`. `.gitleaksignore` also works. Use it for a false positive that no comment can carry, such as one inside generated content.
- **Custom rules.** Drop a `.betterleaks.toml` or `.gitleaks.toml` in the repo root, or point `BETTERLEAKS_CONFIG` at a shared config. See [Per-repo configs](#per-repo-configs) for what that turns off.

## Tests

`test/test.sh` covers the two name-based checks end to end. It builds throwaway repos, pipes a hook payload into `hook.sh`, and asserts the exit code. The binary cases run unconditionally, because that scan needs only git: an added binary blocks, a name with a space and a quote survives the `-z` parsing, a text file passes, a modified tracked binary passes, and both allowlist forms exempt a binary. The name cases assert that all 35 sample names covering the patterns in `conf/betterleaks.toml` block and appear in the block message, that templates and ordinary files pass, that the allowlist exempts a name, and that a repo's own `.betterleaks.toml` wins over the shipped one. Those skip with exit 0 if betterleaks or `jq` is missing. Run `bash test/test.sh`.

`test/test-content.sh` covers the content scan: a staged secret, clean content, an empty stage, a `git add`, a non-repo, an unrelated command, the four `-a` spellings, a `-a` that appears only inside the commit message, `--allow-empty`, a path holding the word `commit`, `commit` behind a `git` flag, each allowlist form, and the text of the block message. Run `bash test/test-content.sh`. It skips with exit 0 if betterleaks or `jq` is missing.

Run both after editing `conf/betterleaks.toml`, because a config error makes the scan fail open silently.

See [test/README.md](test/README.md).

## Files

- `hook.sh` is the hook, invoked from `settings.json`. It deploys via chezmoi to `~/.claude/hooks/block-secret-commits/`.
- `conf/betterleaks.toml` is the rule config the hook passes with `--config`. It deploys alongside `hook.sh`, which resolves it relative to its own path.
- `docs/implementation.md` carries the reasoning, the measurements, and the rejected alternatives, so `hook.sh` and this file stay readable. Not deployed; it is a source-tree document.
- `test/test.sh` is the name-rule and binary-scan test (see [Tests](#tests)).
- `test/test-content.sh` is the content-scan test (see [Tests](#tests)).
