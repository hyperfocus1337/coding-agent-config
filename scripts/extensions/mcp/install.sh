#!/bin/bash

set -e

# Global MCP servers (user scoped). The remove.sh script mirrors this list —
# keep both in sync when adding or dropping a server.

# https://docs.tessl.io/reference/custom-agent-setup
claude mcp add --scope user tessl -- tessl mcp start
# https://github.com/upstash/context7?tab=readme-ov-file#installation
claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp
# https://github.com/jgravelle/jcodemunch-mcp?tab=readme-ov-file#configure-mcp-client
claude mcp add --scope user jcodemunch -- uvx jcodemunch-mcp
# https://github.com/jgravelle/jdocmunch-mcp?tab=readme-ov-file#configure-an-mcp-client
claude mcp add --scope user jdocmunch -- uvx jdocmunch-mcp
# https://stitch.withgoogle.com/docs/mcp/setup
claude mcp add --scope user stitch --transport http https://stitch.googleapis.com/mcp --header "X-Goog-Api-Key: api-key"
# https://directus.io/docs/guides/ai/mcp
claude mcp add --scope user --transport http directus https://your-directus-url.com/mcp --header "Authorization: Bearer your-generated-token"
