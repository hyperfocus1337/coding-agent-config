# tessl (project-scoped MCP)

Connects Claude to the Tessl platform for AI-assisted software engineering workflows. Use when working within a Tessl-managed environment to enable agent capabilities, custom workflow integrations, and project-level context provided by the Tessl infrastructure. Runs over stdio by launching the local `tessl` CLI, so that CLI must be on `PATH` at launch.

Docs: [docs.tessl.io](https://docs.tessl.io/reference/custom-agent-setup)

## Installing into a project

Copy the fragment into the target project's root `.mcp.json`. If the project already has one, merge this entry under `mcpServers` instead of overwriting the file:

```bash
cp templates/mcp/tessl/.mcp.json <project>/.mcp.json
```

## Configuration

The Tessl gateway needs credentials. Either run `tessl auth login` once, or export a `TESSL_TOKEN` before starting Claude and `.mcp.json` interpolates it into the server's environment. Generate a token with `tessl api-key create`.

- `TESSL_TOKEN` is the Tessl auth token (alternative to an interactive `tessl auth login`).
