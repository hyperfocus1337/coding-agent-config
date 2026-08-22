# Extension installation scripts

Scripts for installing and managing agent extensions across environments. Two mechanisms, split by portability:

- **Claude plugins** stay on the `claude plugin` CLI. Claude's plugin marketplace is Claude-specific and has no cross-agent equivalent.
- **MCP servers and third-party skills** are deployed via [APM](https://microsoft.github.io/apm/) (Agent Package Manager) from the repo-root `apm.yml`. APM writes them to Claude today (`targets: [claude]`) but the same manifest can fan out to Cursor, Codex, Gemini, and others by adding entries under `targets:`.

---

## Layout

- `install.sh` — entry point. Runs the env preamble (PATH check, `chezmoi apply` to sync `$HOME` from the repo, container-only git URL rewrites) and then invokes `plugins/install.sh` and `apm/install.sh` in order.
- `plugins/install.sh` — Claude plugin and marketplace installs via `claude plugin ...`, driven by the `plugins.json` catalog (every `scope: "user"` row, marketplaces added first). `plugins/disable.sh` then applies the `false` entries from `settings.json`.
- `skills/install.sh` — vendor-CLI skills, driven by the `skills.json` catalog (every `scope: "user"` row with `channel: "vendor-cli"`).
- `apm/install.sh` — runs `apm install -g --update` from the repo root, deploying the `apm.yml` MCP servers and skills to user scope (`~/.claude.json`, `~/.claude/skills/`). Idempotent; re-resolves refs to latest upstream every run (no committed lockfile).

The declared MCP servers and skills live in `apm.yml` at the repo root; no lockfile is committed, so each install pulls the latest upstream ref. To add or drop one, edit `apm.yml` and re-run `just apm` (then `apm prune` to remove orphans).

Run `./install.sh` to install everything. The child scripts can be run individually but assume the preamble has already executed.

---

## Plugins

Which plugins exist, where each belongs, and why is one file: [`dot_claude/skills/install-plugins/references/plugins.json`](../../dot_claude/skills/install-plugins/references/plugins.json). `plugins/install.sh` installs every `scope: "user"` row from it; the `install-plugins` skill reads the same rows to install a plugin into one repo. This page does not repeat the list, because a copy here drifts from the catalog.

Read the current set:

```
just plugin-catalog
```

Enable and disable state is not in the catalog. `enabledPlugins` in [`dot_claude/settings.json`](../../dot_claude/settings.json) owns it, and `plugins/disable.sh` applies its `false` entries after the installs, because installing a disabled plugin re-enables it. Per-plugin reasoning: [`docs/scope/plugins.md`](../../docs/scope/plugins.md). Component and token inventory per plugin: [`docs/sources/inventory.md`](../../docs/sources/inventory.md).

---

## Standalone CLI skills

Skills installed by a vendor CLI rather than a plugin or APM, because they ship with a companion binary. The set is declared in [`skills.json`](../../dot_claude/skills/install-skills/references/skills.json), which `skills/install.sh` reads: `playwright` via `playwright-cli install --skills`, and `orbit` via `glab skills install`. Both rows are project scope today, so the script installs neither at user scope.

---

## MCP Servers (User-Scoped)

MCP servers are declared in `apm.yml` and deployed globally at user scope via `apm install -g`, available across all Claude sessions. The one user-scoped server, `context7`, reads a `CONTEXT7_API_KEY` from the environment at install time (`apm.yml` interpolates it via `${CONTEXT7_API_KEY}`). Project-scoped servers (tessl, stitch, directus, claude-design, orbit, jcodemunch, jdocmunch) are installed per-project with the `install-mcp` skill rather than deployed user-wide; see [`docs/scope/mcp-servers.md`](../../docs/scope/mcp-servers.md).

### `context7`

Docs: [github.com/upstash/context7](https://github.com/upstash/context7?tab=readme-ov-file#installation)

Gives Claude on-demand access to current library documentation for any framework or package. Use for code generation, API lookups, and setup instructions where accurate, version-specific documentation is critical. This APM-managed server is the only context7 channel: the context7 plugin bundled a second copy of the same server and was removed.
