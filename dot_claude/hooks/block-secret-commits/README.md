# block-secret-commits

A `PreToolUse` hook that blocks `git add` and `git commit` commands which would stage or commit secret files (`.env`, `.envrc`, private keys, credential blobs) that are not gitignored. It is a safety net for accidental `git add .`, not a replacement for a good `.gitignore`.

## How it works

The hook is wired to the `Bash` tool in `settings.json`, so it runs before every shell command. It exits immediately unless the command text contains `git add` or a `git ... commit`, so the cost on ordinary commands is a single fast bail (roughly 12ms of process startup, no external tools spawned).

When it does see one, it lists everything git would actually track with `git ls-files --cached --others --exclude-standard`. That set is tracked files plus untracked-but-not-ignored files, and it deliberately excludes anything gitignored. So a properly gitignored `.env` is silently allowed, because git could never stage it anyway, and gitignore is the natural first escape hatch. Each basename is checked against the ruleset; if any match, the command is blocked with exit code 2 and a message naming the offending files.

The scan covers the whole repo rooted at `CLAUDE_PROJECT_DIR`, not just the paths in this particular command. That is intentional: a non-ignored secret anywhere in the repo blocks the add or commit. The trade-off is that a stray non-ignored secret nags on every `git add`/`git commit` until you gitignore it or override.

## The ruleset

The patterns live in the `is_dangerous` function in `hook.sh`. It takes a basename and returns 0 to block or 1 to allow. The allowlist arm is checked first so template files like `.env.example` pass even though they match the `.env.*` blocklist. Edit the case arms to tune what counts as a secret.

The list is deliberately **filename-based**, not content-based. The key-file names and extensions (ssh/rsa keys, `*.p8`, `*.pkcs8`, `*.pfx`, `*.p12`, keystores, and so on) are drawn from the key-file categories in GitLab's [secret-detection-rules](https://gitlab.com/gitlab-org/security-products/secret-detection/secret-detection-rules/-/tree/main/rules/mit), plus common credential files (`.netrc`, `.pgpass`, `.htpasswd`, `.git-credentials`, `.dockercfg`). That upstream ruleset is otherwise a set of content regexes (matching secret *values* like `sk-...` or `AKIA...` inside files); those cannot be expressed as a cheap basename check and are intentionally out of scope here. For content scanning use a dedicated tool such as [gitleaks](https://github.com/gitleaks/gitleaks) in CI, which consumes that ruleset directly. Encrypted blobs (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) are intentionally not blocked, since committing those is a legitimate workflow.

## Overrides

The hook checks three escape hatches, in this order, and allows the command as soon as one matches.

**1. gitignore (preferred).** If the file is gitignored, the hook never sees it, because the scan uses `--exclude-standard`. This is the right answer almost every time: a secret that should never be committed belongs in `.gitignore`, and then the hook stays silent with no override needed. Reach for the two explicit overrides below only when you genuinely intend to commit a secret-shaped file (an encrypted env, a fixture, a template that happens to match a pattern).

**2. Per-repo marker file.** Create an empty `.claude-allow-secrets` file in the repo root:

```sh
touch .claude-allow-secrets
```

This disables the hook for that repo only. It is persistent and survives across sessions, and because it lives in the repo you can commit it so the whole team inherits the exemption. Use it when a repo legitimately and repeatedly tracks a secret-shaped file.

**3. Environment variable.** Set `CLAUDE_ALLOW_SECRETS` to any non-empty value:

```sh
CLAUDE_ALLOW_SECRETS=1
```

This disables the hook wherever that variable is exported, so it is best for a one-off or session-scoped skip that leaves no trace in the repo. Export it in your shell for the rest of a session, or prefix a single command.

Note that overrides 2 and 3 are all-or-nothing: they disable the whole check, not a single file. To exempt just one path while keeping the guard active for everything else, gitignore that path (override 1) instead.

## Files

- `hook.sh` is the whole hook, invoked from `settings.json`. It deploys via chezmoi to `~/.claude/hooks/block-secret-commits/`.
