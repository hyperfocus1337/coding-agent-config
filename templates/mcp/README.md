# Templates: project-scoped MCP servers

Copyable, project-scoped MCP config for Claude Code. Repo-only (chezmoi-ignored, never deployed to `$HOME`). These servers are scoped to a single project rather than installed user-wide through `apm.yml`.

Each server lives in its own folder with a standalone `.mcp.json` fragment and README:

- [`tessl/`](tessl/) Tessl platform MCP server (stdio via the `tessl` CLI). Needs `TESSL_TOKEN` or `tessl auth login`.
- [`stitch/`](stitch/) Google Stitch MCP server (HTTP transport). Needs `STITCH_API_KEY`.
- [`directus/`](directus/) Directus MCP server (HTTP transport). Needs `DIRECTUS_TOKEN` and a real instance URL.
- [`claude-design/`](claude-design/) Anthropic hosted design MCP server (HTTP transport, no extra secrets).
- [`orbit/`](orbit/) GitLab Orbit MCP server (HTTP transport). May need a GitLab token.
- [`jcodemunch/`](jcodemunch/) deep code analysis and indexing (stdio via `uvx`, no secrets).
- [`jdocmunch/`](jdocmunch/) documentation ingestion and querying (stdio via `uvx`, no secrets).

## Installing into a project

Preferred: use the `install-mcp` skill (`dot_claude/skills/install-mcp/`). It prompts for the server and the agent(s) to target, fills in any placeholder URLs, checks required secrets and stdio commands, and installs through a project `apm.yml` so the config fans out to Claude, Cursor, Codex, and Gemini in one step. It reads its own registry (mirrored from these fragments), so you do not copy anything by hand.

Manual fallback: copy a server's fragment into the target project's root `.mcp.json`. If the project already has a `.mcp.json`, merge the entry under `mcpServers` rather than overwriting the file:

```bash
cp templates/mcp/<server>/.mcp.json <project>/.mcp.json
```

Either way, see each server's README for its required env vars and any placeholder URLs to replace.
