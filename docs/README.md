# Integration docs

General integration documentation and setup instructions for this repository.

## Lifecycle command map

The `sdlc/` folder maps every installed slash command, skill, and subagent onto the eight phases of the software development lifecycle. [`phases.md`](sdlc/phases.md) answers "which installed tool do I reach for right now", grouping tools by phase and then by category of related work. For where any of those tools came from, see `sources/` below.

| File                          | Description                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| [`phases.md`](sdlc/phases.md) | Commands, skills, and subagents grouped by SDLC phase and category |

## Install sources

The `sources/` folder answers "where did this command or skill come from", from the mechanism down to a specific live command. [`channels.md`](sources/channels.md) maps every channel a skill reaches an agent through: local files, standalone CLIs, plugins, and the APM bundle. [`inventory.md`](sources/inventory.md) is the catalog: every installed tool regrouped by install source (manually committed, APM bundle, standalone CLI, Claude plugin, or built into Claude Code), one table per source, and is the companion to [`sdlc/phases.md`](sdlc/phases.md). [`tracing.md`](sources/tracing.md) is the runtime counterpart to `channels.md`: how to trace a live `/command` back to its source when names collide or a command behaves unlike the file you edited.

| File                                   | Description                                                            |
| -------------------------------------- | ---------------------------------------------------------------------- |
| [`channels.md`](sources/channels.md)   | The channels a skill installs through (local, plugins, CLI, APM)       |
| [`inventory.md`](sources/inventory.md) | Every installed tool regrouped by install source, as tables            |
| [`tracing.md`](sources/tracing.md)     | Trace a live `/command` back to its source (name, picker, grep, debug) |

## Project scope

The `scope/` folder answers "does this resource belong in every session, or in one repo". A resource installed at user scope costs resident tokens in every session, in every repo. One page per channel, each the human companion to a JSON catalog that wins when the two disagree: [`skills.md`](scope/skills.md), [`plugins.md`](scope/plugins.md), and [`mcp-servers.md`](scope/mcp-servers.md). The [`install-agent-resources`](../dot_claude/skills/install-agent-resources/SKILL.md) skill is the entry point: it resolves a name against all three catalogs, then routes to `install-skills`, `install-plugins`, or `install-mcp`.

| File                                     | Description                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| [`skills.md`](scope/skills.md)           | Project-scoped skills (catalog: `install-skills/references/skills.json`)    |
| [`plugins.md`](scope/plugins.md)         | Project-scoped plugins (catalog: `install-plugins/references/plugins.json`) |
| [`mcp-servers.md`](scope/mcp-servers.md) | Project-scoped MCP servers (catalog: `install-mcp/references/servers.json`) |

## MCP servers

The `mcp/` folder covers configuring MCP (Model Context Protocol) servers on each platform. [`enabling/`](mcp/enabling/) covers turning servers on per platform (web, desktop, and Android), including repository configuration, authentication, and environment variable setup. [`disabling-servers.md`](mcp/disabling-servers.md) covers turning off servers not wanted by default. [`github-proxy.md`](mcp/github-proxy.md) documents the GitHub MCP tools that Claude Code on the web injects without any configuration. For which servers a project installs, see [`scope/mcp-servers.md`](scope/mcp-servers.md).

| File                                               | Description                                          |
| -------------------------------------------------- | ---------------------------------------------------- |
| [`disabling-servers.md`](mcp/disabling-servers.md) | Disable MCP servers not wanted by default            |
| [`github-proxy.md`](mcp/github-proxy.md)           | The built-in GitHub proxy on Claude Code for the web |
| [`enabling/android.md`](mcp/enabling/android.md)   | Enable MCP servers on Android                        |
| [`enabling/desktop.md`](mcp/enabling/desktop.md)   | Enable MCP servers on desktop                        |
| [`enabling/web.md`](mcp/enabling/web.md)           | Enable MCP servers on the web (claude.ai/code)       |

## Research

The `research/` folder holds investigations into the agent environment and session. These record what was true when measured and can go stale. [`cmux-notifications.md`](research/cmux-notifications.md) explains why Claude Code needs no `cmux notify` hook of its own: the cmux Claude wrapper injects the whole hook set when `claude` starts inside a cmux terminal, so following the published hook guide only produces duplicate notifications, and no hook fires at all in sessions started outside cmux. [`codex-compat.md`](research/codex-compat.md) covers where Claude Code and Codex each look for skills and instructions, and what works today to share content across both. [`instruction-load.md`](research/instruction-load.md) counts the separate directives one session asks the model to obey and finds where they contradict each other. [`plugin-migration.md`](research/plugin-migration.md) audits which Claude plugins APM could carry instead. [`prompt-autocompletion.md`](research/prompt-autocompletion.md) records how the `@` file picker and the `/` command picker list, rank, and accept entries, why Tab on a folder inserts `@folder/ ` with a trailing space, and which query shapes and settings give shell-style directory descent instead. [`prompt-cache-ttl.md`](research/prompt-cache-ttl.md) records what `ENABLE_PROMPT_CACHING_1H` costs: the 1-hour TTL doubles the price of a cache write, so it pays off across long gaps between turns and loses on rapid ones. [`skills-context.md`](research/skills-context.md) estimates the session-start context cost of every installed skill's listing breadcrumb, and explains why the real constraint is description truncation rather than token count.

| File                                                            | Description                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`cmux-notifications.md`](research/cmux-notifications.md)       | Why the Claude Code notification hook is automatic (do not hand-install it) |
| [`codex-compat.md`](research/codex-compat.md)                   | Sharing skills and instructions between Claude Code and Codex               |
| [`instruction-load.md`](research/instruction-load.md)           | How many directives a session stacks, and where they contradict             |
| [`plugin-migration.md`](research/plugin-migration.md)           | Which Claude plugins could move to APM (audit)                              |
| [`prompt-autocompletion.md`](research/prompt-autocompletion.md) | How the `@` and `/` pickers list, rank, and accept entries                  |
| [`prompt-cache-ttl.md`](research/prompt-cache-ttl.md)           | What the 1-hour prompt cache TTL costs, and when it loses                   |
| [`skills-context.md`](research/skills-context.md)               | Context budget consumed by installed skill breadcrumbs                      |

To bootstrap a fresh repository so a Claude Code cloud session (web, Android, CI) gets the same environment as a local machine, invoke the `install-bootstrap` skill. It writes a `SessionStart` hook that fetches the bootstrap script in [`templates/web`](../templates/web/).
