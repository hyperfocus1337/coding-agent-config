# Templates

Copyable, project-scoped config. Repo-only (chezmoi-ignored, never deployed to `$HOME`).

## Packs

- [`web/`](web/) — cloud bootstrap. `bootstrap.sh` installs the full coding-agent-config environment into a Claude Code cloud session (web, Android, CI). A repository reaches it through a `SessionStart` hook that the `install-bootstrap` skill writes.
