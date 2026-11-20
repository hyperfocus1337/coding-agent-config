# Project-scoped MCP servers

Some MCP servers make sense only inside a single project rather than installed user-wide through the root [`apm.yml`](../../apm.yml). This page is the catalog of those servers. The machine-readable source of truth is the `install-mcp` skill's registry at [`dot_claude/skills/install-mcp/references/servers.json`](../../dot_claude/skills/install-mcp/references/servers.json); this page is the human companion to it, so when the two disagree the registry wins.

## Installing

Do not wire these up by hand. Ask Claude to "install the <server> MCP server in this project", or invoke the `install-agent-resources` skill and pick the MCP channel. That routes to `install-mcp`, which is also invocable by exact name. It prompts for the server, the scope, and the coding agent(s) to target, fills in any placeholder values, checks the required secrets and stdio commands, and installs through a project `apm.yml` with `apm mcp install`. The same manifest fans the server out to Claude Code, Cursor, Codex, and Gemini in one step, so there is no per-agent config to maintain.

The skill needs `apm` on `PATH`. It writes each agent's native config (Claude to the project root `.mcp.json`, Cursor to `.cursor/mcp.json`, Codex to `.codex/config.toml`, Gemini to `.gemini/settings.json`) and merges into any existing config rather than overwriting it.

## Catalog

Secrets shown as `${VAR}` stay as literal placeholders in the config and are interpolated from the environment when the agent launches. If a required secret is not already set, the skill offers to scaffold a `.env` or `.envrc` in the project root (empty placeholders, never real values) for you to fill in, or points you at the server's official auth flow instead. Add that file to `.gitignore`, and note the value only reaches the agent if it is in the environment at launch (direnv loads `.envrc` automatically; a plain `.env` needs your shell or tooling to load it). Values marked "prompted" are asked for at install time and baked into the config as literals.

### tessl (stdio)

Tessl platform for AI-assisted software engineering workflows. Runs by launching the local `tessl` CLI, which must be on `PATH`. Authenticate either by running `tessl auth login` once, or by exporting `TESSL_TOKEN` (generate one with `tessl api-key create`). Docs: [docs.tessl.io](https://docs.tessl.io/reference/custom-agent-setup).

### stitch (http)

Google Stitch hosted tooling. Requires a valid `X-Goog-Api-Key` header sourced from `STITCH_API_KEY`. Docs: [stitch.withgoogle.com/docs/mcp/setup](https://stitch.withgoogle.com/docs/mcp/setup).

### directus (http)

Interact with a Directus instance: collections, fields, items, files, flows, and schema. The instance `/mcp` endpoint URL is prompted for at install time. Needs `DIRECTUS_TOKEN`, a generated bearer token. Docs: [directus.io/docs/guides/ai/mcp](https://directus.io/docs/guides/ai/mcp).

### claude-design (http)

Anthropic's hosted design MCP, backing Claude's design and artifact styling tooling. Authenticates through your existing Claude Code credentials, so no extra secret is needed. Endpoint: `https://api.anthropic.com/v1/design/mcp`.

### orbit (http)

GitLab Orbit tooling over the GitLab API. The endpoint URL is prompted for and defaults to `https://gitlab.com/api/v4/orbit/mcp`; point it at your own instance if you are not on gitlab.com. If your instance rejects unauthenticated requests, add an `Authorization: Bearer ${GITLAB_TOKEN}` header and export `GITLAB_TOKEN`.
