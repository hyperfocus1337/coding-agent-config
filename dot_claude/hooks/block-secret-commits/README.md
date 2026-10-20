# block-secret-commits

A `PreToolUse` hook that blocks a `git commit` which would commit a secret. It runs two checks: a **betterleaks scan** over the staged diff, which catches a secret value pasted into an ordinary file and a file whose name alone marks it as a secret, and a **binary scan** that rescans newly added binary files, which the staged diff cannot show. It is a safety net for an accidental `git add .`, not a replacement for a good `.gitignore`.

One scanner, [`core.ts`](core.ts), serves four agents through two adapters:

| Agent              | Adapter                                                                                                               | Loaded by                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code, Codex | [`guard.sh`](guard.sh), a `PreToolUse` command hook on Bash, runs [`command.ts`](command.ts): exit 2 and stderr block | `settings.json.tmpl` and `dot_codex/modify_hooks.json`                                             |
| pi and omp         | [`pi.ts`](pi.ts): `tool_call` on bash returns `{ block, reason }`                                                     | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |

Claude Code runs a command hook and not a mod, because the binary scan copies files, which the mod API cannot do. See [`docs/hooks/decisions.md`](../../../docs/hooks/decisions.md#block-secret-commits-is-a-command-hook-in-claude-code).

This file describes what the hook does and how to work around it. For why it is built this way, see [docs/implementation.md](docs/implementation.md). For the measurements behind each decision and the alternatives that were tested and rejected, see [docs/research.md](docs/research.md).

## Requirements

The hook needs Node 23.6 or later, which runs `.ts` files without a flag. In Claude Code and Codex, `guard.sh` runs `command.ts`. If `node` is missing from `$PATH`, is older than 23.6, or fails, `guard.sh` blocks each `git commit` with a message that names the problem, and lets other commands pass. An app started from the macOS Dock can get a shorter `$PATH` than your terminal, so this block can occur there first. The `SessionStart` check of each agent also warns at the start of the session, see [the hooks README](../README.md#shared-conventions).

Both checks need [betterleaks](https://github.com/betterleaks/betterleaks) on `$PATH`. Without it the betterleaks scan silently does nothing, and the binary scan blocks every newly added binary, because it cannot clear what it cannot read:

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

## What it does

The hook runs before every shell command. It stops at once unless the command is a `git ... commit`. In Claude Code and Codex, the Node start costs about 25 ms for each shell command. In pi and omp, the extension is already loaded, so the cost is less than 1 ms.

### Commit only, not `git add`

Both checks read the index. The hook runs before the command it guards, so at `git add` time the index does not yet hold the files being added. Staging a secret is therefore not blocked at the moment of the `git add`; the commit that would act on it is. Nothing reaches a commit either way.

### Binary scan

betterleaks cannot read a binary blob in git mode, so a keystore, a key bundle, or a database dump would otherwise reach the commit unread. The hook collects the **newly added** binary files, which is exactly the set the staged scan misses, and rescans them with `betterleaks dir`, which does read binaries.

An ordinary image, font, or archive commits freely. Only a binary that actually holds a secret blocks, including one under an innocuous name such as `payload.dat`, which no file-name rule would match.

The scan copies each candidate to a neutral name first. The default betterleaks config exempts image, font, and office extensions from every rule, so a key inside `logo.png` or a password list inside `notes.xlsx` would otherwise scan clean. A file above 100 MB keeps its own path, because the copy costs more than the gap it closes. See [The extension allowlist](docs/implementation.md#the-extension-allowlist).

A modified tracked binary is not checked, because it was checked when it was first added and updating a committed image is routine. The trade-off is that swapping a secret into an already-tracked binary is not caught.

This is the one check that never fails open: if betterleaks is missing, the scan errors, or the file was staged and then removed from the worktree, the file cannot be cleared and so it blocks.

No betterleaks setting can exempt this check, so a binary you intend to commit needs [override 3](#3-per-repo-allowlist-file-a-binary-scan-block).

### betterleaks scan

The hook runs `betterleaks git --staged`, which scans the index against `HEAD`, so it reads only what this commit would add. Two kinds of finding block, and the block message says which is which:

- **a content rule** matched a secret value on a line, for example `generic-api-key` or `github-pat`;
- **the `secret-filename` rule** matched the file name alone.

A finding blocks with exit code 2 and a message naming the rule, the file, the line, and the fingerprint. `--redact` keeps the secret value out of the report, the hook output, and the model's context.

The name rule exists because a content rule matches secret _values_, and so cannot flag a `.pgpass` or a `.netrc`, which hold a human-chosen password with no entropy and no vendor prefix. See [the measurements](docs/research.md#why-the-name-rule-earns-its-place).

### `git commit -a`

`-a` stages tracked modifications after the hook has run, so the index the hook reads does not hold them yet. When the command carries `-a` or `--all` and the staged scan is clean, the hook runs a second scan over the unstaged tracked diff. Both have to be clean for the commit to proceed.

A message glued straight to the flag (`git commit -m"..."`) can cost one extra scan, which may block on a working-tree secret the commit would not have included.

### `git commit --amend`

`--amend` with an empty index rewrites content already in `HEAD`, which a staged scan does not read. That content was scanned when it was first committed, so the gap only matters if the original commit predates this hook.

### Scope: staged files only

Both checks read the index, so they see only what the commit would add. A secret-shaped file sitting untracked in the working tree does not block an unrelated commit. It blocks the commit that actually stages it.

### When a check cannot run

The betterleaks scan **fails open**: a missing `betterleaks`, an error in the scan code, a directory that is not a git repository, a scanner error, a config that fails to parse, or a scan past its 4 s cap all allow the commit. Only a real finding blocks. The binary scan does the opposite and blocks whatever it cannot clear, so the two checks fail in opposite directions by design.

A capped scan prints a warning to stderr naming the command to run by hand. It is the one fail-open path you cannot infer from a clean run.

A config error is fatal to betterleaks rather than a warning, so a typo in `conf/betterleaks.toml` disables the whole scan silently. **Run `node test/check.ts` after you edit that file.**

### Cost

About 25 ms on a command that is not a commit, in Claude Code and Codex: this is the Node start. A commit also pays for the scan. Full table in [docs/research.md](docs/research.md#cost).

## The name ruleset

The names live in the `secret-filename` rule in [`conf/betterleaks.toml`](conf/betterleaks.toml). Edit the `path` pattern there to tune what counts as a secret.

Any file ending in `.env` counts, not only `.env` itself, so `prod.env` and `config/production.env` block. The template names are exempt in both spellings: `.env.example` and `example.env` both commit freely, as do `.sample`, `.template`, and `.dist`.

Encrypted blobs (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) are deliberately not matched, since committing those is a legitimate workflow.

Before editing the pattern, read [Rule dialect](docs/implementation.md#rule-dialect). Patterns are Go RE2, which has no lookahead, and an invalid pattern disables the scan silently rather than erroring visibly. [Name ruleset provenance](docs/research.md#name-ruleset-provenance) records where the list came from and which upstreams were rejected.

### Per-repo configs

The hook asks `betterleaks config path` and passes `--config` only when the answer is `default`, meaning nothing else selected a config. A repo carrying a `.betterleaks.toml` or `.gitleaks.toml` keeps winning. Such a repo keeps the content rules and loses the name rules; its config can extend this file to get them back:

```toml
[extend]
path = "~/.claude/hooks/block-secret-commits/conf/betterleaks.toml"
```

The shipped config sets `[extend] useDefault = true`, so the upstream rules and their allowlist still apply and the canonical AWS example key `AKIAIOSFODNN7EXAMPLE` does not block a commit.

## Overrides

Pick by which check blocked you. A **content finding** names a rule, a file and a line, and betterleaks' own escape hatches cover it. A **binary scan** block names a path only, and nothing in betterleaks can exempt it, so it needs this hook's own list.

### 1. gitignore (preferred)

If the file is gitignored, git never stages it, so neither check ever sees it. This is the right answer almost every time: a secret that should never be committed belongs in `.gitignore`, and then the hook stays silent with no override needed. Reach for the explicit overrides below only when you genuinely intend to commit a secret-shaped or binary file.

### 2. betterleaks escape hatches (a content finding)

These are portable: they are betterleaks features, so a teammate scanning the same repo without this hook inherits them, and a repo that already carries a gitleaks config keeps working unchanged.

- **Inline comment.** Put a `betterleaks:allow` comment on the flagged line. `gitleaks:allow` also works. Use it for a value that looks like a secret but is not, such as a test fixture or a documented example key.
- **Ignore file.** Add the fingerprint from the block message to `.betterleaksignore` in the repo root, one per line. `.gitleaksignore` also works.
- **Custom rules.** Drop a `.betterleaks.toml` or `.gitleaks.toml` in the repo root, or point `BETTERLEAKS_CONFIG` at a shared config. See [Per-repo configs](#per-repo-configs) for what that turns off.

A fingerprint is `file:rule:line`, so `app.py:generic-api-key:42`, and that exact form is the only thing the ignore file accepts. A bare path, a `file:rule` pair and a glob are all silently ignored; see [the measurements](docs/research.md#what-betterleaksignore-accepts).

One entry clears one secret on one line, so a file holding five secrets needs five entries. The line number is part of the key, so inserting a line above the secret invalidates the entry and the commit blocks again. A `secret-filename` finding is always reported on line 1, so it does not drift.

### 3. Per-repo allowlist file (a binary scan block)

Create a `.agent-allow-secrets` file in the repo root listing the file(s) you intend to commit, one per line. An entry matches either a repo-relative path or a bare basename. The hook ignores blank lines and lines that start with `#`. A `#` after a path is part of the entry, so put a comment on its own line:

```sh
# .agent-allow-secrets
# A keystore fixture that the binary scan blocks.
test/fixtures/keystore.p12
# A blob that betterleaks cannot clear.
build/assets.bin
# A bare basename: each file named .pgpass, in any folder.
.pgpass
```

The list is for the user of this hook, so keep the file out of git with the exclude file of the repo, not `.gitignore`, which the team shares. One line covers the allow files of both guards, and all worktrees share the exclude file:

```sh
echo '.agent-allow-*' >> "$(git rev-parse --path-format=absolute --git-path info/exclude)"
```

This list is the only mechanism that covers the binary scan, because that scan reports no stable fingerprint to write down. See [Why this list exists at all](docs/implementation.md#why-this-list-exists-at-all).

An entry exempts the file from **every** check, the content rules included. Only the listed files are exempted; everything else still blocks.

For a content finding this is the last resort, because the exemption is invisible to anyone without this hook. One case still lands here: a `secret-filename` hit you want cleared by bare basename across many directories has no fingerprint that expresses it.

### 4. Environment variable

Set `AGENT_ALLOW_SECRETS` to the file(s) to exempt, whitespace- or colon-separated, using the same path-or-basename matching and covering the same checks:

```sh
AGENT_ALLOW_SECRETS=test/fixtures/keystore.p12:.pgpass
```

This is best for a one-off or session-scoped skip that leaves no trace in the repo.

## Tests

`node test/check.ts`, from the hook folder, builds throwaway repos and runs `guard.sh` on a Bash payload for each case. It checks the exit code, the block message, and that stdout stays empty. It also checks `pi.ts` with a stub `pi`, that an error in the binary scan blocks, and that `guard.sh` blocks a commit when `node` is missing or fails. Most cases need betterleaks and are skipped without it. It prints one `FAIL` line for each failed case, then `all pass` or the failure count. `just hooks-check` runs it with the checks of the other hooks.

Run it after you edit `conf/betterleaks.toml`, because a config error makes the scan fail open with no sign. See [test/README.md](test/README.md).

## Files

| File                          | Deployed to `~/.claude/hooks/block-secret-commits/` | Role                                                                     |
| ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `core.ts`                     | Yes                                                 | Both scans and the block messages. The adapters pass the file functions. |
| `io.ts`                       | Yes                                                 | The file and process functions under Node                                |
| `guard.sh`                    | Yes                                                 | Runs `command.ts`. Blocks a commit when `command.ts` gives no verdict.   |
| `command.ts`                  | Yes                                                 | Command hook for Claude Code and Codex                                   |
| `pi.ts`                       | Yes                                                 | pi and omp extension                                                     |
| `conf/betterleaks.toml`       | Yes                                                 | The rule config that the hook passes with `--config`                     |
| `README.md`, `docs/`, `test/` | No                                                  | Kept in the repo by `.chezmoiignore`                                     |

[`docs/implementation.md`](docs/implementation.md) gives the reason for each decision. [`docs/research.md`](docs/research.md) holds the measurements and the alternatives that were tested and rejected.
