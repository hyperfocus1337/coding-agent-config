# Integration docs

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
    ├── disabling-servers.md  — Disable MCP servers not wanted by default
    └── enabling/             — Enable MCP servers per platform
        ├── android.md  — Android
        ├── desktop.md  — Desktop
        └── web.md      — Web (claude.ai/code)
```

## Agent environments

The `agents/` folder covers how to configure and prepare Claude Code sessions in remote environments, including session hooks and bootstrap scripts. It also documents skills in [`skills.md`](agents/skills.md), which maps every channel a skill reaches an agent through: local files, standalone CLIs, plugins, and the APM bundle.

## MCP servers

The `mcp/` folder contains platform-specific guides for configuring MCP (Model Context Protocol) servers across different Claude Code environments. `enabling/` covers turning servers on per platform — web, desktop, and Android — including repository configuration, authentication, and environment variable setup. `disabling-servers.md` covers turning off servers not wanted by default.
