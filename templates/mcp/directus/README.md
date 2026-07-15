# directus (project-scoped MCP)

Directus MCP server over HTTP transport for interacting with a Directus instance: collections, fields, items, files, flows, and schema.

Docs: [directus.io/docs/guides/ai/mcp](https://directus.io/docs/guides/ai/mcp)

## Installing into a project

Copy the fragment into the target project's root `.mcp.json`. If the project already has one, merge this entry under `mcpServers` instead of overwriting the file:

```bash
cp templates/mcp/directus/.mcp.json <project>/.mcp.json
```

## Configuration

The `url` in `.mcp.json` is a placeholder. Replace it with your instance's `/mcp` endpoint, and export `DIRECTUS_TOKEN` before starting Claude in the project so `.mcp.json` interpolates it into the `Authorization` header.

- `DIRECTUS_TOKEN` is a generated Directus bearer token.
- `url` must point at your Directus instance's `/mcp` endpoint.
