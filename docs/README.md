# Integration docs

General integration documentation and setup instructions for this repository.

## Structure

```
docs/
├── sdlc/                     # Which installed tool for which lifecycle phase
│   └── phases.md             — Commands, skills, and subagents grouped by SDLC phase and category
├── sources/                  # Where every command and skill comes from (install provenance)
│   ├── channels.md           — The channels a skill installs through (local, plugins, CLI, APM)
│   ├── inventory.md          — Every installed tool regrouped by install source, as tables
│   └── tracing.md            — Trace a live /command back to its source (name, picker, grep, debug)
├── scope/                    # Which resources install per project instead of user-wide
│   ├── skills.md             — Project-scoped skills (catalog: install-skills/references/skills.json)
│   ├── plugins.md            — Project-scoped plugins (catalog: install-plugins/references/plugins.json)
│   └── mcp-servers.md        — Project-scoped MCP servers (catalog: install-mcp/references/servers.json)
├── mcp/                      # MCP server configuration, per platform
│   ├── disabling-servers.md  — Disable MCP servers not wanted by default
│   ├── github-proxy.md       — The built-in GitHub proxy on Claude Code for the web
│   └── enabling/             — Enable MCP servers per platform
│       ├── android.md        — Android
│       ├── desktop.md        — Desktop
│       └── web.md            — Web (claude.ai/code)
└── research/                 # Investigations into the agent environment and session
    ├── cmux-notifications.md — Why the Claude Code notification hook is automatic (do not hand-install it)
    ├── codex-compat.md       — Sharing skills and instructions between Claude Code and Codex
    ├── plugin-migration.md   — Which Claude plugins could move to APM (audit)
    └── skills-context.md     — Context budget consumed by installed skill breadcrumbs
```

## Lifecycle command map

The `sdlc/` folder maps every installed slash command, skill, and subagent onto the eight phases of the software development lifecycle. [`phases.md`](sdlc/phases.md) answers "which installed tool do I reach for right now", grouping tools by phase and then by category of related work. For where any of those tools came from, see `sources/` below.

## Install sources

The `sources/` folder answers "where did this command or skill come from", from the mechanism down to a specific live command. [`channels.md`](sources/channels.md) maps every channel a skill reaches an agent through: local files, standalone CLIs, plugins, and the APM bundle. [`inventory.md`](sources/inventory.md) is the catalog: every installed tool regrouped by install source (manually committed, APM bundle, standalone CLI, Claude plugin, or built into Claude Code), one table per source, and is the companion to [`sdlc/phases.md`](sdlc/phases.md). [`tracing.md`](sources/tracing.md) is the runtime counterpart to `channels.md`: how to trace a live `/command` back to its source when names collide or a command behaves unlike the file you edited.

## Project scope

The `scope/` folder answers "does this resource belong in every session, or in one repo". A resource installed at user scope costs resident tokens in every session, in every repo. One page per channel, each the human companion to a JSON catalog that wins when the two disagree: [`skills.md`](scope/skills.md), [`plugins.md`](scope/plugins.md), and [`mcp-servers.md`](scope/mcp-servers.md). The [`install-agent-resources`](../dot_claude/skills/install-agent-resources/SKILL.md) skill is the entry point: it resolves a name against all three catalogs, then routes to `install-skills`, `install-plugins`, or `install-mcp`.

## MCP servers

The `mcp/` folder covers configuring MCP (Model Context Protocol) servers on each platform. [`enabling/`](mcp/enabling/) covers turning servers on per platform (web, desktop, and Android), including repository configuration, authentication, and environment variable setup. [`disabling-servers.md`](mcp/disabling-servers.md) covers turning off servers not wanted by default. [`github-proxy.md`](mcp/github-proxy.md) documents the GitHub MCP tools that Claude Code on the web injects without any configuration. For which servers a project installs, see [`scope/mcp-servers.md`](scope/mcp-servers.md).

## Research

The `research/` folder holds investigations into the agent environment and session. These record what was true when measured and can go stale. [`cmux-notifications.md`](research/cmux-notifications.md) explains why Claude Code needs no `cmux notify` hook of its own: the cmux Claude wrapper injects the whole hook set when `claude` starts inside a cmux terminal, so following the published hook guide only produces duplicate notifications, and no hook fires at all in sessions started outside cmux. [`codex-compat.md`](research/codex-compat.md) covers where Claude Code and Codex each look for skills and instructions, and what works today to share content across both. [`plugin-migration.md`](research/plugin-migration.md) audits which Claude plugins APM could carry instead. [`skills-context.md`](research/skills-context.md) estimates the session-start context cost of every installed skill's listing breadcrumb, and explains why the real constraint is description truncation rather than token count.

To bootstrap a fresh repository so a Claude Code cloud session (web, Android, CI) gets the same environment as a local machine, invoke the `install-bootstrap` skill. It writes a `SessionStart` hook that fetches the bootstrap script in [`templates/web`](../templates/web/).
