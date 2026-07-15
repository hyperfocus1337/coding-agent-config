# Enable MCP Servers on Web

> **Don't add a GitHub MCP server here.** Claude Code on the web already ships GitHub's full MCP server built-in (tools prefixed `mcp__github__`: create/read issues and PRs, trigger Actions, manage branches and files, and more), authenticated through a proxy via the GitHub App or `/web-setup`. Adding `https://api.githubcopilot.com/mcp` with a PAT is redundant. The only GitHub gaps are creating releases and repo admin, which need the `gh` CLI + `GH_TOKEN`. See [../github-proxy.md](../github-proxy.md) for the full tool list.

## 1. Configure repository

Add a `.mcp.json` file to your repository root. On the web, only servers committed here load (`claude mcp add` writes local config that the cloud session never sees).

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "Authorization": "Bearer ${CONTEXT7_SECRET_KEY}"
      }
    }
  }
}
```

## 2. Configure Claude Code on the web

Add a new custom environment in [Claude Code on the web](https://claude.ai/code):

| Field              | Value              |
|--------------------|--------------------|
| **Name**           | Custom MCP servers |
| **Network access** | Full               |

**Environment variables:**

```
CONTEXT7_SECRET_KEY=<your-key>
```

> Add `GH_TOKEN=<your-pat>` only if you need the GitHub operations the built-in tools miss (creating releases, repo admin) via the `gh` CLI. Install `gh` in your setup script with `apt update && apt install -y gh`.
