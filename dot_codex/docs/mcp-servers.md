# Add an MCP server to Codex

Codex keeps each MCP server as a `[mcp_servers.<name>]` table in `~/.codex/config.toml`. The ChatGPT desktop app, the Codex CLI and the IDE extension read this one file, so a server added in one of them shows in all three. A project can also have its own servers in `.codex/config.toml`, but only when Codex trusts the project.

## Add a server in the app

1. Open Settings > Plugins, then click Add > Add MCP server.
2. Type a name. It becomes the key in `[mcp_servers.<name>]`.
3. Choose STDIO for a local command, or Streamable HTTP for a URL such as `https://mcp.example.com/mcp`.
4. Save. The server shows under Servers on the MCPs tab, with a switch that turns it on or off.
5. For a server that uses OAuth, click Authenticate, or run `codex mcp login <name>`.

The same server as config, for a remote URL:

```toml
[mcp_servers.example]
url = "https://mcp.example.com/mcp"
# Without OAuth: the name of a variable that holds the token, never the token itself.
bearer_token_env_var = "EXAMPLE_MCP_TOKEN"
```

Codex connects from this Mac, so a server on `localhost` or behind a VPN works. A Claude Desktop custom connector cannot do this.

## Where to store it

`chezmoi apply` runs [`modify_private_config.toml`](../modify_private_config.toml). The script overwrites only the keys in its `OURS` block, so a server added in the app stays after an apply. The repository does not hold it, so a new Mac does not get it.

| Server                   | Store it in                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Needed on every Mac      | `OURS` in `modify_private_config.toml`, next to `context7`. Update the row in the README too. |
| One repository only      | `.codex/config.toml` in that repository                                                       |
| A test, or only this Mac | The app. Nothing to commit.                                                                   |

Do not put a token in `OURS` or in a committed `.codex/config.toml`. Use OAuth, `bearer_token_env_var`, or a key that the script reads from `.envrc`, as it does for `CONTEXT7_API_KEY`. Codex keeps OAuth tokens outside `config.toml`: `mcp_oauth_credentials_store = "auto"`, the default, uses the macOS keychain. A server that `OURS` names gets the `OURS` values again at each apply, so change it in the script, not in the app.

Source: [Connect Codex to an MCP server](https://learn.chatgpt.com/docs/extend/mcp).
