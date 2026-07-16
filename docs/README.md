# Integration docs

General integration documentation and setup instructions for this repository.

## Structure

```
docs/
├── apm/          # APM (agent package manager) notes
│   └── plugin-migration.md  — Which Claude plugins could move to APM (audit)
├── agents/       # Agent environment and session guides
│   ├── skills.md        — Every channel a skill reaches an agent through (local, plugins, CLI, APM)
│   └── codex-compat.md  — Sharing skills and instructions between Claude Code and Codex
└── mcp/          # MCP server configuration guides
    ├── disabling-servers.md  — Disable MCP servers not wanted by default
    └── enabling/             — Enable MCP servers per platform
        ├── android.md  — Android
        ├── desktop.md  — Desktop
        └── web.md      — Web (claude.ai/code)
```

## Agent environments

The `agents/` folder documents skills in [`skills.md`](agents/skills.md), which maps every channel a skill reaches an agent through: local files, standalone CLIs, plugins, and the APM bundle. [`codex-compat.md`](agents/codex-compat.md) covers where Claude Code and Codex each look for skills and instructions, and what works today to share content across both.

To bootstrap a fresh repository so a Claude Code cloud session (web, Android, CI) gets the same environment as a local machine, use the [`templates/web`](../templates/web/) pack. It ships a drop-in `SessionStart` hook and the bootstrap script it runs.

## MCP servers

The `mcp/` folder contains platform-specific guides for configuring MCP (Model Context Protocol) servers across different Claude Code environments. `enabling/` covers turning servers on per platform — web, desktop, and Android — including repository configuration, authentication, and environment variable setup. `disabling-servers.md` covers turning off servers not wanted by default.
