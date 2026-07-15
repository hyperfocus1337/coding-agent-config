# jdocmunch (project-scoped MCP)

An MCP server focused on ingesting and querying documentation. Use when you need Claude to reason over large volumes of markdown, HTML, or plain-text documentation, useful for answering questions about internal docs, runbooks, or any documentation that isn't indexed by Context7. Runs over stdio via `uvx`, so no secrets are required.

Docs: [github.com/jgravelle/jdocmunch-mcp](https://github.com/jgravelle/jdocmunch-mcp?tab=readme-ov-file#configure-an-mcp-client)

## Installing into a project

Copy the fragment into the target project's root `.mcp.json`. If the project already has one, merge this entry under `mcpServers` instead of overwriting the file:

```bash
cp templates/mcp/jdocmunch/.mcp.json <project>/.mcp.json
```

`uvx` fetches and runs `jdocmunch-mcp` on demand, so it must be on `PATH` at launch. Index a documentation source once before querying it with the other tools.
