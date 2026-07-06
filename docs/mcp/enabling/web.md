# Enable MCP Servers on Web

## 1. Configure Repository

Add a `.mcp.json` file to your repository root:

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
      "headers": {
        "Authorization": "Bearer ${CONTEXT7_SECRET_KEY}"
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PAT}"
      }
    }
  }
}
```

## 2. Create a GitHub PAT

Go to [GitHub → Settings → Personal Access Tokens](https://github.com/settings/personal-access-tokens) and create a new token with the following settings:

| Field                 | Value                                                  |
|-----------------------|--------------------------------------------------------|
| **Token name**        | Claude Code on the web token                           |
| **Description**       | Token used within a Claude Code on the web environment |
| **Resource owner**    | hyperfocus1337                                         |
| **Expiration**        | No expiration                                          |
| **Repository access** | Only select repositories                               |

**Required permissions:**

- Actions
- Contents
- Issues
- Metadata *(required)*
- Pull requests

## 3. Configure Claude Code on the Web

Add a new custom environment in [Claude Code on the web](https://claude.ai/code) with the following settings:

| Field              | Value              |
|--------------------|--------------------|
| **Name**           | Custom MCP servers |
| **Network access** | Custom             |

**Allowed domains:**

Either full network access or custom list:

- `mcp.context7.com`
- `api.githubcopilot.com`
- `cdn.playwright.dev`
- `get.tessl.io`
- `api.tessl.io`
- `install.tessl.io`

> Also check the option to include the [default list of common package managers](https://code.claude.com/docs/en/claude-code-on-the-web#default-allowed-domains).

**Environment variables:**

```
GITHUB_PAT=<your-token>
```
