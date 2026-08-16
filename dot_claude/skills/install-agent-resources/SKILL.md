---
name: install-agent-resources
description: Install an agent resource (MCP server, skill, plugin, or the cloud bootstrap hook) at project, local, or user scope, so the resource costs context only where it is used. Routes to the skill that owns the channel: install-mcp for MCP servers, install-skills for skills through APM, a repo-local copy, or a vendor CLI, install-plugins for Claude Code plugins, and install-bootstrap for the SessionStart hook that sets up a cloud session. Resolves the request by id across the three catalogs first, and asks when one id exists in two of them (orbit is both an MCP server and a vendor-CLI skill). Use for "install <name> in this project", "add an MCP server", "install a skill", "install a plugin", "bootstrap this repo for the web", "project-scoped resource", "move this off global scope", "which resources can I demote to project scope".
---

# install-agent-resources

Routes an install request to the skill that owns the channel. This skill resolves what the user asked for and hands off. It runs no install itself.

| Resource        | Skill                                                | Catalog                                                                                 |
| :-------------- | :--------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| MCP server      | [`install-mcp`](../install-mcp/SKILL.md)             | [`install-mcp/references/servers.json`](../install-mcp/references/servers.json)         |
| Skill           | [`install-skills`](../install-skills/SKILL.md)       | [`install-skills/references/skills.json`](../install-skills/references/skills.json)     |
| Plugin          | [`install-plugins`](../install-plugins/SKILL.md)     | [`install-plugins/references/plugins.json`](../install-plugins/references/plugins.json) |
| Cloud bootstrap | [`install-bootstrap`](../install-bootstrap/SKILL.md) | none, one resource, matched on intent                                                   |

The four skills carry `disable-model-invocation: true`, so this skill is the only entry point that is auto-selected. Each stays invocable by exact name.

## Procedure

### 1. Resolve the request

The cloud bootstrap has no catalog: it is one resource, so match it on intent before reading anything. The user asks to make a repository work in a cloud session (claude.ai/code, Android, CI), or names the `SessionStart` hook or the bootstrap script. Route to `install-bootstrap` and go to step 2.

Otherwise read the three catalogs and match the user's words against `id` first, then against `use_when`. The id decides the channel, so the user does not have to know that `neon` is an APM skill and `watch` is a plugin.

- **One match**: name the resource, the channel, and the row's `scope`, then go to step 2.
- **Two matches**: show both rows with their `why` and ask which one. `orbit` is an MCP server and a vendor-CLI skill today. Never guess.
- **No match**: ask the user which of the three kinds it is. A plugin id has the `plugin@marketplace` form, an MCP server needs a transport and a connection, a skill arrives through APM, a repo copy, or a vendor CLI. Each skill takes an uncataloged resource and offers to add the row.

### 2. Hand off

Invoke the skill of that row by name and pass the resolved id, the row, and the target project. Do not repeat its procedure here. Each skill asks the scope itself, with `project`, `local`, and `user`, and preselects the row's `scope`. `install-bootstrap` is the exception: it is project scope only, so do not ask.

State once, before the hand-off, what the three scopes cost:

- **project**: committed config in the target repo, so every collaborator gets it on clone.
- **local**: gitignored config, so it stays on this machine.
- **user**: loaded in every session on this machine, so it costs resident tokens in every project.

### 3. Keep user scope reproducible

A user-scope install that is not declared in the config repo disappears on the next clean rebuild. Every skill writes the declaration back for that reason, after the user confirms. The config repo is found in this order: `$AGENT_CONFIG_REPO`, then `/workspaces/coding-agent-config` if it exists, then ask the user.

## Notes

- Human companions to the three catalogs: [`docs/scope/mcp-servers.md`](../../../docs/scope/mcp-servers.md), [`docs/scope/skills.md`](../../../docs/scope/skills.md), [`docs/scope/plugins.md`](../../../docs/scope/plugins.md). The cloud bootstrap has [`templates/web/README.md`](../../../templates/web/README.md) instead.
- A plugin whose value is a portable skill belongs to `install-skills`, not `install-plugins`. The classification is in [`docs/research/plugin-migration.md`](../../../docs/research/plugin-migration.md).
- Uninstalling is not part of these skills. Demoting a resource from user to project scope means installing it in the project first, verifying it, then removing the user-scope copy as a separate step.
