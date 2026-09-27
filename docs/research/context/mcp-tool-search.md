# MCP tool search

Claude Code defers every MCP tool by default. The first request of a session sends only the tool names, in a system reminder, together with the server instructions. When the model needs a tool, it loads the full schema with the `ToolSearch` tool, and the next requests send that schema in the `tools` field with `"defer_loading": true`.

Checked 2026-09-27 against Claude Code 2.1.283 and the [MCP documentation](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search). In this setup, the two context7 tools are deferred, and their schemas are 4,767 characters of JSON (`resolve-library-id` 2,987, `query-docs` 1,780). The [`/context-payload`](../../../dot_claude/skills/context-payload/) skill shows the deferred tools of a session.

## When tools load upfront

| Condition                                                                                              | Result                                                                                              |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `ENABLE_TOOL_SEARCH` is not set                                                                        | All MCP tools deferred (the default)                                                                |
| `ENABLE_TOOL_SEARCH=false`                                                                             | All MCP tools upfront                                                                               |
| `ENABLE_TOOL_SEARCH=auto` or `auto:N`                                                                  | Upfront while the schemas total less than N% of the context window (default 10%), deferred above it |
| `"alwaysLoad": true` in a server entry                                                                 | That server's tools upfront                                                                         |
| `"anthropic/alwaysLoad": true` in the `_meta` object of a tool, set by the server                      | That tool upfront                                                                                   |
| `ANTHROPIC_BASE_URL` points to a host that Anthropic does not run, and `ENABLE_TOOL_SEARCH` is not set | All MCP tools upfront                                                                               |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` is set                                                        | All MCP tools upfront, cannot be overridden                                                         |
| The model does not support `tool_reference` blocks (older than the Claude 4.5 generation)              | All MCP tools upfront                                                                               |

`ENABLE_TOOL_SEARCH` can go in the `env` block of `settings.json`.

## Trade-off

A deferred tool costs a `ToolSearch` round trip the first time a session uses it, while an upfront tool costs its schema in every request, also in sessions that never use it. `alwaysLoad` also makes startup wait up to 5 seconds for the server to connect, and a stdio server started through `npx -y`, such as context7, can take most of that time on a cold start.

This setup keeps the default. `rules/tools.md` tells the model to use Context7 before it writes code, so a coding session pays the `ToolSearch` round trip only once.
