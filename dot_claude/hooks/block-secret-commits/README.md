# block-secret-commits

A `PreToolUse` hook that blocks `git add` and `git commit` commands which would stage or commit secret files (`.env`, `.envrc`, private keys, credential blobs) that are not gitignored. It is a safety net for accidental `git add .`, not a replacement for a good `.gitignore`.

## How it works

The hook is wired to the `Bash` tool in `settings.json`, so it runs before every shell command. It exits immediately unless the command text contains `git add` or a `git ... commit`, so the cost on ordinary commands is a single fast bail (roughly 12ms of process startup, no external tools spawned).

When it does see one, it lists everything git would actually track with `git ls-files --cached --others --exclude-standard`. That set is tracked files plus untracked-but-not-ignored files, and it deliberately excludes anything gitignored. So a properly gitignored `.env` is silently allowed, because git could never stage it anyway, and gitignore is the natural first escape hatch. Each basename is checked against the ruleset; if any match, the command is blocked with exit code 2 and a message naming the offending files.

The scan covers the whole repo rooted at `CLAUDE_PROJECT_DIR`, not just the paths in this particular command. That is intentional: a non-ignored secret anywhere in the repo blocks the add or commit. The trade-off is that a stray non-ignored secret nags on every `git add`/`git commit` until you gitignore it or override.

## The ruleset

The patterns live in the `is_dangerous` function in `../_shared/secret-filenames.sh`, shared with the stage-edited-file hook so both use one list. It takes a basename and returns 0 to block or 1 to allow. The allowlist arm is checked first so template files like `.env.example` pass even though they match the `.env.*` blocklist. Edit the case arms there to tune what counts as a secret.

The list is deliberately **filename-based**, not content-based. The key-file names and extensions (ssh/rsa keys, `*.p8`, `*.pkcs8`, `*.pfx`, `*.p12`, keystores, and so on) are drawn from the key-file categories in GitLab's [secret-detection-rules](https://gitlab.com/gitlab-org/security-products/secret-detection/secret-detection-rules/-/tree/main/rules/mit), plus common credential files (`.netrc`, `.pgpass`, `.htpasswd`, `.git-credentials`, `.dockercfg`). That upstream ruleset is otherwise a set of content regexes (matching secret *values* like `sk-...` or `AKIA...` inside files); those cannot be expressed as a cheap basename check and are intentionally out of scope here. For content scanning use a dedicated tool such as [gitleaks](https://github.com/gitleaks/gitleaks) in CI, which consumes that ruleset directly. Encrypted blobs (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) are intentionally not blocked, since committing those is a legitimate workflow.

## Overrides

The hook offers three escape hatches. The first drops a file from the scan entirely; the other two exempt named files while keeping the guard active for the rest.

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

## Files

- `hook.sh` is the whole hook, invoked from `settings.json`. It deploys via chezmoi to `~/.claude/hooks/block-secret-commits/`.
