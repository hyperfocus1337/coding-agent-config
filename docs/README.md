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

The `agents/` folder covers running this repository's Claude Code configuration in another coding agent. [`pi.md`](agents/pi.md) documents how pi loads `~/.claude/skills`, `commands`, `rules`, and `CLAUDE.md` through the extensions, settings, and symlink in [`dot_pi/agent/`](../dot_pi/agent/README.md), and what to do when pi rewrites its own settings file. [`codex.md`](agents/codex.md) documents how Codex loads `~/.claude/skills`, `CLAUDE.md` with the rules, and the hooks in `~/.claude/hooks` through the symlink in [`dot_agents/`](../dot_agents/symlink_skills) and the files in [`dot_codex/`](../dot_codex/README.md), and that commands do not reach Codex.

[`omp.md`](agents/omp.md) documents omp's native Claude discovery, the short and namespaced command aliases, the generated always-apply rules, and how this differs from loading pi extensions.

| File                          | Description                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| [`pi.md`](agents/pi.md)       | Claude Code skills, commands, rules, and CLAUDE.md in pi                                      |
| [`codex.md`](agents/codex.md) | Claude Code skills, CLAUDE.md, rules, and hooks in Codex                                      |
| [`omp.md`](agents/omp.md)     | Native Claude discovery, command aliases, generated rules, and pi extension boundaries in omp |

## MCP servers

The `mcp/` folder covers configuring MCP (Model Context Protocol) servers on each platform. [`enabling/`](mcp/enabling/) covers turning servers on per platform (web, desktop, and Android), including repository configuration, authentication, and environment variable setup. [`disabling-servers.md`](mcp/disabling-servers.md) covers turning off servers not wanted by default. [`github-proxy.md`](mcp/github-proxy.md) documents the GitHub MCP tools that Claude Code on the web injects without any configuration. For which servers a project installs, see [`scope/mcp-servers.md`](scope/mcp-servers.md).

| File                                               | Description                                          |
| -------------------------------------------------- | ---------------------------------------------------- |
| [`disabling-servers.md`](mcp/disabling-servers.md) | Disable MCP servers not wanted by default            |
| [`github-proxy.md`](mcp/github-proxy.md)           | The built-in GitHub proxy on Claude Code for the web |
| [`enabling/android.md`](mcp/enabling/android.md)   | Enable MCP servers on Android                        |
| [`enabling/desktop.md`](mcp/enabling/desktop.md)   | Enable MCP servers on desktop                        |
| [`enabling/web.md`](mcp/enabling/web.md)           | Enable MCP servers on the web (claude.ai/code)       |

## Hooks

The `hooks/` folder gives the design of the hooks in [`dot_claude/hooks/`](../dot_claude/hooks/README.md): one TypeScript core for each hook, which Claude Code, pi, omp, and Codex share through an adapter for each agent.

| File                                 | Description                                              |
| ------------------------------------ | -------------------------------------------------------- |
| [`README.md`](hooks/README.md)       | The core and the 3 adapters, and where each one is wired |
| [`authoring.md`](hooks/authoring.md) | The rules for a hook folder, and the steps to add a hook |
| [`platforms.md`](hooks/platforms.md) | What the hook API of each agent can and cannot do        |
| [`decisions.md`](hooks/decisions.md) | Why the hooks are built this way                         |

## Research

The `research/` folder holds investigations into the agent environment and session. These record what was true when measured and can go stale. One subfolder per subject: `hooks/` for the scoping of the hooks and their alternatives, `commands/` for the git methods behind the slash commands, `context/` for what a session loads and what that costs, `interface/` for the prompt and the terminal around it, and `install/` for how a tool reaches the agent.

### Hooks

The `research/hooks/` folder holds the source reading, tests, and transcript counts behind the hooks in [`dot_claude/hooks/`](../dot_claude/hooks/README.md). [`hooks/`](hooks/README.md) gives the design that follows from them.

- [`hook-scoping.md`](research/hooks/hook-scoping.md) checks, from the source and live tests of Claude Code, pi, omp, and Codex, that each hook attaches to the right event and tool names. The type checks use the wrong stop event in omp, and omp `ast_edit` and `eval`, a Codex patch sent through the shell, and Claude Code `NotebookEdit` skip some file hooks.
- [`event-scoping.md`](research/hooks/event-scoping.md) measures, from 205 Claude Code transcripts, whether each format, lint, and type-check hook runs after each tool call or at the stop.

| File                                                  | Description                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`hook-scoping.md`](research/hooks/hook-scoping.md)   | The event, matcher, and tool names of each hook in each agent, with a verdict and a fix |
| [`event-scoping.md`](research/hooks/event-scoping.md) | After each tool call or at the stop: the event for each per-file and whole-project hook |

### Commands

The `research/commands/` folder holds the investigations behind the slash commands in `dot_claude/commands/`. [`parallel-commits.md`](research/commands/parallel-commits.md) compares seven git methods that let two sessions commit on one branch in one checkout, and explains why only a private index with `commit-tree` and a compare-and-swap `update-ref` is safe when both sessions commit at the same moment. [`parallel-commits-walkthrough.md`](research/commands/parallel-commits-walkthrough.md) follows one run of `/git:commit:parallel` command by command, with real output and the state of the working tree, both indexes, and `HEAD` after each step. [`staged-commits-walkthrough.md`](research/commands/staged-commits-walkthrough.md) does the same for `/git:commit:conversation` and `/git:commit:multiple`, which stage each unit in the shared index, and names the problems that this method has.

| File                                                                                   | Description                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`parallel-commits.md`](research/commands/parallel-commits.md)                         | Git methods for parallel commits on one branch                     |
| [`parallel-commits-walkthrough.md`](research/commands/parallel-commits-walkthrough.md) | One run of `/git:commit:parallel`, step by step                    |
| [`staged-commits-walkthrough.md`](research/commands/staged-commits-walkthrough.md)     | One run of `/git:commit:conversation` and `multiple`, step by step |

### Context budget

The `research/context/` folder answers what a session carries before it does any work, and what that costs. [`instruction-load.md`](research/context/instruction-load.md) counts the separate directives one session asks the model to obey and finds where they contradict each other. The [`context-payload`](../dot_claude/skills/context-payload/SKILL.md) skill captures a new session's first API request and ranks its context costs. [`prompt-cache-ttl.md`](research/context/prompt-cache-ttl.md) records what `ENABLE_PROMPT_CACHING_1H` costs: the 1-hour TTL doubles the price of a cache write, so it pays off across long gaps between turns and loses on rapid ones. [`disabled-tools.md`](research/context/disabled-tools.md) lists the built-in tools and features that `settings.json` turns off to cut that load, and how to turn each one back on. [`mcp-tool-search.md`](research/context/mcp-tool-search.md) explains why MCP tools are deferred by default, and which settings load them upfront. [`alternative-settings.md`](research/context/alternative-settings.md) compares the ways to start a session with other settings than `~/.claude/settings.json`.

| File                                                                  | Description                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`instruction-load.md`](research/context/instruction-load.md)         | How many directives a session stacks, and where they contradict |
| [`prompt-cache-ttl.md`](research/context/prompt-cache-ttl.md)         | What the 1-hour prompt cache TTL costs, and when it loses       |
| [`disabled-tools.md`](research/context/disabled-tools.md)             | Built-in tools and features turned off, and how to turn them on |
| [`mcp-tool-search.md`](research/context/mcp-tool-search.md)           | Why MCP tools are deferred, and what loads them upfront         |
| [`alternative-settings.md`](research/context/alternative-settings.md) | Start a session with other settings, or a separate profile      |

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
