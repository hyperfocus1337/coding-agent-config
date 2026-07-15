# block-secret-commits

A `PreToolUse` hook that blocks git commits which would include secret files (`.env`, `.envrc`, private keys, credential blobs) that are not gitignored. It is a safety net for accidental `git add . && git commit`, not a replacement for a good `.gitignore`.

## How it works

The hook is wired to the `Bash` tool in `settings.json`, so it runs before every shell command. It exits immediately unless the command text mentions a git commit, so the cost on ordinary commands is a single fast bail (roughly 12ms of process startup, no external tools spawned).

When it does see a commit, it lists everything git would actually track with `git ls-files --cached --others --exclude-standard`. That set is tracked files plus untracked-but-not-ignored files, and it deliberately excludes anything gitignored. So a properly gitignored `.env` is silently allowed, because git could never commit it anyway, and gitignore is the natural first escape hatch. Each basename is checked against the ruleset; if any match, the commit is blocked with exit code 2 and a message naming the offending files.

The scan covers the whole repo rooted at `CLAUDE_PROJECT_DIR`, not just the paths in this particular commit. That is intentional: a non-ignored secret anywhere in the repo blocks the commit. The trade-off is that a stray non-ignored secret nags on every commit until you gitignore it or override.

## The ruleset

The patterns live in the `is_dangerous` function in `hook.sh`. It takes a basename and returns 0 to block or 1 to allow. The allowlist arm is checked first so template files like `.env.example` pass even though they match the `.env.*` blocklist. Edit the case arms to tune what counts as a secret.

## Overrides

Two escape hatches for when committing such a file is legitimate:

- Create a `.claude-allow` file in the project root. Persistent and per-repo, and you can commit the marker itself so the whole team inherits the exemption.
- Set `CLAUDE_ALLOW_ENV_COMMIT` to a non-empty value in the environment. Good for a one-off or session-scoped skip that leaves no trace in the repo.

## Files

- `hook.sh` is the whole hook, invoked from `settings.json`. It deploys via chezmoi to `~/.claude/hooks/block-secret-commits/`.
