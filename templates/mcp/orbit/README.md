# orbit (project-scoped MCP)

GitLab Orbit MCP server over HTTP transport, exposing GitLab's Orbit tooling through the GitLab API. Use in projects that work against a GitLab instance and want Claude to reach Orbit's endpoints.

Endpoint: `https://gitlab.com/api/v4/orbit/mcp`

## Installing into a project

Copy the fragment into the target project's root `.mcp.json`. If the project already has one, merge this entry under `mcpServers` instead of overwriting the file:

```bash
cp templates/mcp/orbit/.mcp.json <project>/.mcp.json
```

GitLab's API requires authentication. If your instance rejects unauthenticated requests, add a personal or project access token as an `Authorization: Bearer ${GITLAB_TOKEN}` header alongside the `url`, and export `GITLAB_TOKEN` before starting Claude. Point the `url` at your own instance if you are not using `gitlab.com`.
