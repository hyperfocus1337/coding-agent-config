# Integration Docs

General integration documentation and setup instructions for this repository.

## Structure

```
docs/
├── apm/          # APM (agent package manager) notes
│   └── plugin-migration.md  — Which Claude plugins could move to APM (audit)
├── agents/       # Agent environment and session guides
│   ├── bootstrap.md  — Bootstrapping remote environments (claude.ai/code, CI, containers)
│   └── skills.md     — Every channel a skill reaches an agent through (local, plugins, CLI, APM)
└── mcp/          # MCP server configuration guides
    ├── android.md    — Enable MCP servers on Android
    ├── desktop.md    — Enable MCP servers on Desktop
    └── web.md        — Enable MCP servers on the Web (claude.ai/code)
```

## Agent Environments

The `agents/` folder covers how to configure and prepare Claude Code sessions in remote environments, including session hooks, bootstrap scripts, and MCP server setup.

## MCP Servers

The `mcp/` folder contains platform-specific guides for configuring MCP (Model Context Protocol) servers across different Claude Code environments — web, desktop, and Android. Each guide covers repository configuration, authentication, and environment variable setup.
