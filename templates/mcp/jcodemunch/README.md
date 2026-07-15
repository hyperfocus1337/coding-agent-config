# jcodemunch (project-scoped MCP)

An MCP server that enables deep code analysis and understanding across a codebase. Use when you need Claude to ingest, index, and reason over large amounts of source code, particularly useful for onboarding to unfamiliar repositories or performing cross-file analysis. Runs over stdio via `uvx`, so no secrets are required.

Docs: [github.com/jgravelle/jcodemunch-mcp](https://github.com/jgravelle/jcodemunch-mcp?tab=readme-ov-file#configure-mcp-client)

## Installing into a project

Copy the fragment into the target project's root `.mcp.json`. If the project already has one, merge this entry under `mcpServers` instead of overwriting the file:

```bash
cp templates/mcp/jcodemunch/.mcp.json <project>/.mcp.json
```

`uvx` fetches and runs `jcodemunch-mcp` on demand, so it must be on `PATH` at launch. The tool stores its index under `~/.code-index/`; run `index_folder` once per project before using the other tools.
