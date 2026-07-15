# claude-design (project-scoped MCP)

Anthropic's hosted design MCP server over HTTP transport, backing Claude's design and artifact styling tooling. Use in projects where you want Claude to reach the design endpoint for visual and layout work.

Endpoint: `https://api.anthropic.com/v1/design/mcp`

## Installing into a project

Copy the fragment into the target project's root `.mcp.json`. If the project already has one, merge this entry under `mcpServers` instead of overwriting the file:

```bash
cp templates/mcp/claude-design/.mcp.json <project>/.mcp.json
```

The endpoint is Anthropic-hosted and authenticates through your existing Claude Code credentials, so no extra secrets are set in `.mcp.json`. If your setup requires an explicit token, add it as an `Authorization` header alongside the `url`.
