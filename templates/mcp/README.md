# Templates

Copyable, project-scoped config. Repo-only (chezmoi-ignored, never deployed to `$HOME`).

## Project-scoped MCP servers (`.mcp.json`)

MCP servers for Claude Code scoped to a single project, not user-wide. Kept out of the global `apm.yml` on purpose.

### Installing into a project

Copy into a target project's root:

```bash
cp templates/mcp/.mcp.json <project>/.mcp.json
```

Then set the env vars and fix the placeholder URL:

- `STITCH_API_KEY` — stitch API key
- `DIRECTUS_TOKEN` — directus bearer token
- `url` for directus is a placeholder; replace with your instance's `/mcp` endpoint

### Server: `stitch`

Docs: [stitch.withgoogle.com/docs/mcp/setup](https://stitch.withgoogle.com/docs/mcp/setup)

Google Stitch MCP server (HTTP transport). Use for Stitch-powered workflows that depend on its hosted tooling. Requires a valid `X-Goog-Api-Key` header; export `STITCH_API_KEY` before use and `.mcp.json` interpolates it into the header.

### Server: `directus`

Docs: [directus.io/docs/guides/ai/mcp](https://directus.io/docs/guides/ai/mcp)

Directus MCP server (HTTP transport) for interacting with a Directus instance: collections, fields, items, files, flows, and schema. Replace the placeholder `url` in `.mcp.json` with your instance's `/mcp` endpoint, and export `DIRECTUS_TOKEN` (a generated token).
