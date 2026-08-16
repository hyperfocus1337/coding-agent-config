---
name: install-plugins
description: Install a Claude Code plugin at project, local, or user scope from the curated catalog, so a plugin costs context only where it is used. Use for "install plugin", "add plugin to this project", "project-scoped plugin", "demote plugin to project scope", "which plugins can I move off global". Entry point is the install-agent-resources skill.
disable-model-invocation: true
---

# install-plugins

Installs Claude Code plugins into a scope you choose: `project` (committed, every collaborator gets it on clone), `local` (gitignored, this machine only), or `user` (global, every session). The catalog of known plugins is [`references/plugins.json`](references/plugins.json); its human companion is [`docs/plugins/project-plugins.md`](../../../docs/plugins/project-plugins.md).

Plugins whose value is a portable skill belong to the `install-skills` skill instead. Plugins whose value is a hook, an LSP bridge, an MCP server, or a bundled binary stay here, because APM cannot deploy those. The classification is in [`docs/apm/plugin-migration.md`](../../../docs/apm/plugin-migration.md).

## When to use

The user wants a plugin available in one repo instead of every session, or wants to know which installed plugins are candidates to move off user scope. For MCP servers use `install-mcp`. For skills use `install-skills`.

## Inputs you gather (ask the user)

1. **Which plugin**, by id or by need ("something for GitLab"). Resolve against the catalog first.
2. **Which scope**: `project`, `local`, or `user`. Ask every time. Preselect `project`.
3. **Target project**: the current working directory unless told otherwise.

## The catalog

Each row records intent, never live state:

| Field                | Meaning                                                                          |
| :------------------- | :------------------------------------------------------------------------------- |
| `id`                 | `plugin@marketplace`, the exact argument for `claude plugin install`             |
| `marketplace.source` | argument for `claude plugin marketplace add`                                     |
| `url`                | page a human opens to read what the plugin does, not always the marketplace repo |
| `scope`              | where this plugin belongs: `user`, `project`, or `local`                         |
| `status`             | `user-keep`, `project-candidate`, `local-candidate`, `superseded`, `disabled`    |
| `requires`           | binaries that must be on `PATH` for the plugin to work                           |
| `why`                | the reason for `scope` and `status`                                              |
| `use_when`           | the condition under which a project should take it                               |
| `superseded_by`      | what covers it instead, on `superseded` rows only                                |

Component inventory and token cost are not stored. Read them live with `claude plugin details <name>`.

`scripts/extensions/plugins/install.sh` reads the same file and installs every `scope: "user"` row that is not `superseded`, so a row is the single declaration of a user-scope plugin.

Enable and disable state is not in the catalog. `dot_claude/settings.json` owns it under `enabledPlugins`, chezmoi deploys that file to `~/.claude/settings.json`, and `scripts/extensions/plugins/disable.sh` applies the `false` entries after an install. Installing a disabled plugin re-enables it, which is why that step runs last.

## Procedure

### 0. Preflight

Check `claude` is on `PATH`. Read the catalog. Read the live state with `claude plugin list --json`. That list is machine-wide: rows carry a `scope` field, and project rows carry `projectPath`, so filter before comparing.

### 1. Resolve the request to a row

Match on `id` first, then on `use_when`. Show the user the row's `why`, `use_when`, and `requires`, plus the always-on token figure from `claude plugin details <name>`.

Never offer a `superseded` row as an install. Report what covers it instead (`superseded_by`) and stop.

For a plugin not in the catalog, ask for its `plugin@marketplace` id and marketplace source, then continue. Offer to add a row in step 5.

### 2. Preflight the plugin

Check every binary in `requires` with `command -v`. A missing binary does not block the install, but report it: the plugin will not work until the binary is present.

### 3. Ask the scope

Present `project`, `local`, `user` with the row's `scope` preselected. Explain the consequence in one line each: project is committed and reaches collaborators, local is gitignored and stays on this machine, user loads in every session and costs resident tokens.

### 4. Install

**Project scope.** Two commands, both needed. The install records only `enabledPlugins`, so a fresh clone cannot resolve the marketplace without the second command:

```bash
claude plugin marketplace add <marketplace.source> --scope project
claude plugin install <id> --scope project
```

Confirm `.claude/settings.json` now holds both `enabledPlugins` and `extraKnownMarketplaces`. Tell the user to commit that file.

**Local scope.** One command. The marketplace resolves from the machine's user-level list, and `.claude/settings.local.json` is gitignored, so no marketplace declaration is written:

```bash
claude plugin install <id> --scope local
```

**User scope.** Install, then record the row, or the plugin disappears on the next clean rebuild:

```bash
claude plugin install <id> --scope user
```

### 5. Record a user-scope install in the config repo

Only for `user` scope, and only after the user confirms the write.

Locate the config repo in this order: `$AGENT_CONFIG_REPO`, then `/workspaces/coding-agent-config` if it exists, then ask.

Add or update the row in `<config-repo>/dot_claude/skills/install-plugins/references/plugins.json` with `scope: "user"`, a `why`, and a `use_when`. When the plugin ships MCP servers the user does not want loaded, also add `"<id>": false` to `enabledPlugins` in `<config-repo>/dot_claude/settings.json`. Then tell the user to commit both changes and, on other machines, to run `just extensions` to reproduce them.

Skip this step for `project` and `local` scope. Those installs live in the target repo, not here.

### 6. Report

State the scope, the files written, and whether a restart is needed. Claude Code applies a plugin change on the next session, so end with `/reload-plugins` or a restart when the plugin adds hooks or MCP servers.

## Notes

- A plugin that ships MCP servers cannot have one server disabled on its own. Disable the whole plugin, or take just the server through `install-mcp`. See [`docs/mcp/disabling-servers.md`](../../../docs/mcp/disabling-servers.md).
- `claude plugin install` accepts a bare plugin name when only one marketplace provides it, but the catalog always stores `plugin@marketplace` so the resolution never depends on which marketplaces a machine happens to have.
- Uninstalling is not part of this skill. Demoting a plugin from user to project scope needs `claude plugin uninstall <name> --scope user` after the project install is verified, and that is a separate, deliberate step.
