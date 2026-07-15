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

Two escape hatches for when committing such a file is legitimate:

- Create a `.claude-allow` file in the project root. Persistent and per-repo, and you can commit the marker itself so the whole team inherits the exemption.
- Set `CLAUDE_ALLOW_ENV_COMMIT` to a non-empty value in the environment. Good for a one-off or session-scoped skip that leaves no trace in the repo.

## Files

- `hook.sh` is the whole hook, invoked from `settings.json`. It deploys via chezmoi to `~/.claude/hooks/block-secret-commits/`.
