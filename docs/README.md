# Integration docs

General integration documentation and setup instructions for this repository.

## Structure

```
docs/
├── sdlc.md       # Slash commands, skills, and agents mapped onto SDLC phases and roles
├── apm/          # APM (agent package manager) notes
│   └── plugin-migration.md  — Which Claude plugins could move to APM (audit)
├── agents/       # Agent environment and session guides
│   ├── skills.md                — Every channel a skill reaches an agent through (local, plugins, CLI, APM)
│   ├── codex-compat.md          — Sharing skills and instructions between Claude Code and Codex
│   ├── slash-command-origin.md  — Trace a live /command back to its source (name, picker, grep, debug)
│   └── skills-context.md        — Context budget consumed by installed skill breadcrumbs
└── mcp/          # MCP server configuration guides
    ├── project-servers.md    — Catalog of project-scoped servers (install via the install-mcp skill)
    ├── disabling-servers.md  — Disable MCP servers not wanted by default
    └── enabling/             — Enable MCP servers per platform
        ├── android.md  — Android
        ├── desktop.md  — Desktop
        └── web.md      — Web (claude.ai/code)
```

## Lifecycle command map

[`sdlc.md`](sdlc.md) maps every installed slash command, skill, and subagent onto the eight phases of the software development lifecycle, grouped within each phase by the role that drives that work. It answers "which installed tool do I reach for right now", and closes with an inventory that regroups everything by install source (manually committed, APM bundle, standalone CLI, Claude plugin, or built into Claude Code).

## Agent environments

The `agents/` folder documents skills in [`skills.md`](agents/skills.md), which maps every channel a skill reaches an agent through: local files, standalone CLIs, plugins, and the APM bundle. [`codex-compat.md`](agents/codex-compat.md) covers where Claude Code and Codex each look for skills and instructions, and what works today to share content across both. [`slash-command-origin.md`](agents/slash-command-origin.md) is the runtime counterpart to `skills.md`: how to trace a live `/command` back to its source when names collide or a command behaves unlike the file you edited. [`skills-context.md`](agents/skills-context.md) estimates the session-start context cost of every installed skill's listing breadcrumb, and explains why the real constraint is description truncation rather than token count.

To bootstrap a fresh repository so a Claude Code cloud session (web, Android, CI) gets the same environment as a local machine, use the [`templates/web`](../templates/web/) pack. It ships a drop-in `SessionStart` hook and the bootstrap script it runs.

## MCP servers

The `mcp/` folder contains guides for configuring MCP (Model Context Protocol) servers. [`project-servers.md`](mcp/project-servers.md) is the catalog of project-scoped servers (tessl, stitch, directus, claude-design, orbit, jcodemunch, jdocmunch) that are installed per-project with the `install-mcp` skill rather than user-wide. `enabling/` covers turning servers on per platform (web, desktop, and Android), including repository configuration, authentication, and environment variable setup. `disabling-servers.md` covers turning off servers not wanted by default.
