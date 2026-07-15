# Templates

Copyable, project-scoped config. Repo-only (chezmoi-ignored, never deployed to `$HOME`).

## Packs

- [`mcp/`](mcp/) — project-scoped MCP servers (`.mcp.json`) copied into a single project, not user-wide.
- [`web/`](web/) — cloud bootstrap pack. A drop-in `SessionStart` hook that installs the full coding-agent-config environment into a Claude Code cloud session (web, Android, CI).
