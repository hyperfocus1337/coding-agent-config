# stitch (project-scoped MCP)

Google Stitch MCP server over HTTP transport. Use for Stitch-powered workflows that depend on its hosted tooling.

Docs: [stitch.withgoogle.com/docs/mcp/setup](https://stitch.withgoogle.com/docs/mcp/setup)

## Installing into a project

Copy the fragment into the target project's root `.mcp.json`. If the project already has one, merge this entry under `mcpServers` instead of overwriting the file:

```bash
cp templates/mcp/stitch/.mcp.json <project>/.mcp.json
```

## Configuration

The server requires a valid `X-Goog-Api-Key` header. Export `STITCH_API_KEY` before starting Claude in the project and `.mcp.json` interpolates it into the header.

- `STITCH_API_KEY` is the Stitch API key.
