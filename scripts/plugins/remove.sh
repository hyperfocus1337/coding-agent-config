#!/bin/bash

set -e

# Temporarily remove user-scoped MCP servers.
#
# Why this script exists:
#   Disabling MCP servers via the `/mcp` UI only writes to `~/.claude/.claude.json`
#   using `disabledMcpjsonServers` on project level settings in, not in
#   `.claude/settings.json`. That key only affects servers defined in project
#   `.mcp.json` files — it does NOT disable user-scoped servers stored in
#   `~/.claude/.claude.json` (servers added via `claude mcp add --scope user ...`).
#
#   The only way to fully turn off a user-scoped MCP server is to remove it
#   with `claude mcp remove <name> --scope user`. To bring them back, re-run
#   `scripts/plugins/claude.sh`, which contains the canonical add commands.
#
# Usage:
#   ./scripts/plugins/remove.sh # remove all listed servers
#   Comment out any line below to keep that server installed.

# https://docs.tessl.io/reference/custom-agent-setup
claude mcp remove --scope user tessl
# https://github.com/upstash/context7?tab=readme-ov-file#installation
# claude mcp remove --scope user context7
# https://github.com/jgravelle/jcodemunch-mcp?tab=readme-ov-file#configure-mcp-client
claude mcp remove --scope user jcodemunch
# https://github.com/jgravelle/jdocmunch-mcp?tab=readme-ov-file#configure-an-mcp-client
claude mcp remove --scope user jdocmunch
# https://stitch.withgoogle.com/docs/mcp/setup
claude mcp remove --scope user stitch
# https://directus.io/docs/guides/ai/mcp
claude mcp remove --scope user directus
