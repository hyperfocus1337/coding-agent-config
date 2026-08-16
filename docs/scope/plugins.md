# Project-scoped Claude plugins

A plugin installed at user scope adds its skill, command, and agent descriptions to every session, in every repo. Most plugins here are needed in one kind of repo only. This page explains the plugin catalog, which records where each plugin belongs. The machine-readable source of truth is [`dot_claude/skills/install-plugins/references/plugins.json`](../../dot_claude/skills/install-plugins/references/plugins.json); when this page and the catalog disagree, the catalog wins.

The catalog is read by two consumers. [`scripts/extensions/plugins/install.sh`](../../scripts/extensions/plugins/install.sh) installs every `scope: "user"` row when the machine is set up. The `install-plugins` skill reads the same file to install a plugin into one project. One declaration, two readers, no second list.

The catalog answers where a plugin belongs. It does not answer whether a plugin is enabled: `enabledPlugins` in [`dot_claude/settings.json`](../../dot_claude/settings.json) owns that, and [`plugins/disable.sh`](../../scripts/extensions/plugins/disable.sh) applies its `false` entries after the installs, because installing a disabled plugin re-enables it.

## Installing

Ask Claude to "install the <plugin> plugin in this project", or invoke the `install-agent-resources` skill and pick the plugin channel. The skill asks for the scope, checks the binaries the plugin needs, and reports the always-on token cost from `claude plugin details` before it installs anything.

Scope decides where the declaration lands:

- `project` writes `enabledPlugins` **and** `extraKnownMarketplaces` to the committed `.claude/settings.json`. Both keys are required: `claude plugin install --scope project` records only the first, so a fresh clone cannot resolve the marketplace without the second.
- `local` writes to the gitignored `.claude/settings.local.json` and resolves the marketplace from the machine's user-level list.
- `user` installs globally and adds a row to the catalog in this repo, so the next clean rebuild reproduces it.

## Reading the catalog

The current table, printed from the catalog rather than copied into this page:

```bash
jq -r '["ID","SCOPE","STATUS","USE WHEN"], (.plugins[] | [.id, .scope, .status, .use_when]) | join("|")' \
  ~/.claude/skills/install-plugins/references/plugins.json | column -t -s '|'
```

Candidates to move off user scope:

```bash
jq -r '.plugins[] | select(.status | test("candidate")) | "\(.id)|\(.use_when)"' \
  ~/.claude/skills/install-plugins/references/plugins.json | column -t -s '|'
```

## Status values

| Status              | Meaning                                                                                                                                        |
| :------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-keep`         | Belongs at user scope. A session-wide hook, or a tool a global rule points at.                                                                 |
| `project-candidate` | Should move to a repo that meets its `use_when`.                                                                                               |
| `local-candidate`   | Personal tooling. Install gitignored, never commit it into someone else's repo.                                                                |
| `disabled`          | Installed at user scope, then disabled, because its MCP servers would load otherwise. See [disabling-servers.md](../mcp/disabling-servers.md). |
| `superseded`        | A built-in command or an APM-managed server already covers it. Never install it.                                                               |

## Which channel a plugin belongs to

APM carries portable primitives only: skills, subagents, commands, and MCP server config. It does not wire hooks, LSP bridges, or bundled binaries. A plugin whose value is one of those stays on the `claude plugin` CLI and lives in this catalog. A plugin that is only skills can move to the APM channel and belongs to `install-skills` instead. The per-plugin classification, and the two cases where APM tooling limits forced a plugin to stay (`ast-grep`, `glab`), are in [`docs/research/plugin-migration.md`](../research/plugin-migration.md).
