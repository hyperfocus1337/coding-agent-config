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

## Other agents

The `agents/` folder covers running this repository's Claude Code configuration in another coding agent. [`pi.md`](agents/pi.md) documents how pi loads `~/.claude/skills`, `commands`, `rules`, and `CLAUDE.md` through the extensions, settings, and symlink in [`dot_pi/agent/`](../dot_pi/agent/README.md), and what to do when pi rewrites its own settings file.

| File                    | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| [`pi.md`](agents/pi.md) | Claude Code skills, commands, rules, and CLAUDE.md in pi |

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

The `research/` folder holds investigations into the agent environment and session. These record what was true when measured and can go stale. One subfolder per subject: `agents/` for other coding agents, `context/` for what a session loads and what that costs, `interface/` for the prompt and the terminal around it, and `install/` for how a tool reaches the agent.

### Other agents

The `research/agents/` folder holds the source reading and probes behind [`agents/pi.md`](agents/pi.md) and Codex support. One finding per page:

- [`hook-events.md`](research/agents/hook-events.md) lists every lifecycle event a hook can attach to on each side, 33 for Claude Code and 36 for pi. The two are flexible in opposite directions: pi reaches deeper per event, into the message list and the provider request, while Claude Code fires at more of the points a guardrail cares about and can answer in five ways, three of which need no code.
- [`codex-compat.md`](research/agents/codex-compat.md) measures what Claude Code 2.1.278 and Codex 0.154.0 already share: Codex runs Claude's hook payload and loads Claude-format plugins, Claude reads `AGENTS.md` once `instructionFiles` is set, and one `.agents/skills/` tree serves both through a symlink.

| File                                                 | Description                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| [`hook-events.md`](research/agents/hook-events.md)   | Hook lifecycle events in Claude Code and pi, compared (from source) |
| [`codex-compat.md`](research/agents/codex-compat.md) | Sharing skills, instructions, and hooks with Codex (measured)       |

### Context budget

The `research/context/` folder answers what a session carries before it does any work, and what that costs. [`instruction-load.md`](research/context/instruction-load.md) counts the separate directives one session asks the model to obey and finds where they contradict each other. [`skills-context.md`](research/context/skills-context.md) estimates the session-start context cost of every installed skill's listing breadcrumb, and explains why the real constraint is description truncation rather than token count. [`prompt-cache-ttl.md`](research/context/prompt-cache-ttl.md) records what `ENABLE_PROMPT_CACHING_1H` costs: the 1-hour TTL doubles the price of a cache write, so it pays off across long gaps between turns and loses on rapid ones.

| File                                                          | Description                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| [`instruction-load.md`](research/context/instruction-load.md) | How many directives a session stacks, and where they contradict |
| [`skills-context.md`](research/context/skills-context.md)     | Context budget consumed by installed skill breadcrumbs          |
| [`prompt-cache-ttl.md`](research/context/prompt-cache-ttl.md) | What the 1-hour prompt cache TTL costs, and when it loses       |

### Prompt interface

The `research/interface/` folder covers the prompt line and the terminal around it. [`prompt-autocompletion.md`](research/interface/prompt-autocompletion.md) records how the `@` file picker and the `/` command picker list, rank, and accept entries, why Tab on a folder inserts `@folder/ ` with a trailing space, and which query shapes and settings give shell-style directory descent instead. [`cmux-notifications.md`](research/interface/cmux-notifications.md) explains why Claude Code needs no `cmux notify` hook of its own: the cmux Claude wrapper injects the whole hook set when `claude` starts inside a cmux terminal, so following the published hook guide only produces duplicate notifications, and no hook fires at all in sessions started outside cmux.

| File                                                                      | Description                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`prompt-autocompletion.md`](research/interface/prompt-autocompletion.md) | How the `@` and `/` pickers list, rank, and accept entries                  |
| [`cmux-notifications.md`](research/interface/cmux-notifications.md)       | Why the Claude Code notification hook is automatic (do not hand-install it) |

### Install channels

The `research/install/` folder holds audits of how a tool reaches the agent. [`plugin-migration.md`](research/install/plugin-migration.md) audits which Claude plugins APM could carry instead, and names the two cases where APM tooling limits forced a plugin to stay on the plugin CLI. For the catalog these audits work against, see `sources/` and `scope/` above.

| File                                                          | Description                                    |
| ------------------------------------------------------------- | ---------------------------------------------- |
| [`plugin-migration.md`](research/install/plugin-migration.md) | Which Claude plugins could move to APM (audit) |

To bootstrap a fresh repository so a Claude Code cloud session (web, Android, CI) gets the same environment as a local machine, invoke the `install-bootstrap` skill. It writes a `SessionStart` hook that fetches the bootstrap script in [`templates/web`](../templates/web/).
