# Templates

Copyable, project-scoped config. Repo-only (chezmoi-ignored, never deployed to `$HOME`).

## `.mcp.json`

Project-scope MCP servers for Claude Code. Copy into a target project's root:

```bash
cp templates/.mcp.json <project>/.mcp.json
```

Then set the env vars and fix the placeholder URL:

- `STITCH_API_KEY` — stitch API key
- `DIRECTUS_TOKEN` — directus bearer token
- `url` for directus is a placeholder; replace with your instance's `/mcp` endpoint

Kept out of the global `apm.yml` on purpose: these are per-project, not user-wide.
