---
name: install-mcp
description: Install a project-scoped, cross-agent MCP server into the current project via apm.yml. Use when the user wants to add an MCP server (tessl, stitch, directus, claude-design, orbit, jcodemunch, jdocmunch, or a custom one) to a repo's .mcp.json / .cursor / .codex / .gemini config instead of copying templates by hand. Triggers: "add an MCP server", "install MCP", "set up .mcp.json", "project MCP", "wire up <server> MCP".
---

# install-mcp

Installs project-scoped MCP servers into the current project and fans them out to whichever coding agents the user names (Claude Code, Cursor, Codex, Gemini, ...). All translation is delegated to `apm` via a project `apm.yml`; this skill never hand-writes per-agent config formats. The available servers are cataloged for humans in [`docs/mcp/project-servers.md`](../../../docs/mcp/project-servers.md); the machine source this skill reads is [`references/servers.json`](references/servers.json).

## When to use

The user wants to add one or more MCP servers to a repo (not user-wide). For user-wide installs, that is `apm.yml` at the config-repo root, not this skill.

## Inputs you gather (ask the user)

1. **Which server(s)** from the registry ([`references/servers.json`](references/servers.json)), or a custom one not listed.
2. **Which agent(s)**: `claude`, `cursor`, `codex`, `gemini` (apm target names; others apm supports are fine too).
3. **Target project**: default to the current working directory unless told otherwise.

## Procedure

### 0. Preflight the toolchain

Confirm `apm` and `uv` are both on `PATH` (`command -v apm uv`). Without `apm` the install cannot run; without `uv` the merge helper cannot run. Stop and tell the user how to install whichever is missing.

### 1. Read the registry

Load [`references/servers.json`](references/servers.json). Show the user the available servers with their one-line `summary`, and ask which to install and for which agents. For a server not in the registry, ask the user for its transport and connection details (or point them at the upstream docs) and build an apm self-defined `dep` in the same shape (`{name, registry: false, transport, ...}`); stdio needs `command`/`args`, http needs `url`/`headers`.

### 2. Resolve config per chosen server

For each selected server, take its `dep` and:

- **`prompts`**: each entry marks a value that must be filled in (e.g. a Directus instance URL). Ask the user, using `default` if present, and substitute the answer for the `{{KEY}}` placeholder in the `dep`. These are baked in as literals, not env vars.
- **`secrets`**: leave every `${VAR}` in the dep exactly as written (the agent interpolates it from the environment at launch). For each secret, check whether it is set (`printenv VAR`). Do not assume the user already has it. If any are unset, offer one of these, do not just warn:
  - Scaffold a credentials file in the project root so there is one place to fill them in. Ask which the user prefers: `.envrc` (direnv style, `export VAR=` lines, matching this repo's own pattern; direnv loads it into the environment automatically so the agent picks it up at launch) or `.env` (plain `VAR=` lines; remind the user it only takes effect if their shell or tooling loads it before the agent starts). Append only the missing vars without duplicating an existing line, write empty placeholders and never real values, and tell the user to add the file to `.gitignore` if it is not already ignored.
  - Point at the server's official auth flow when it has one (e.g. tessl's `tessl auth login`, per `notes`/`docs`), in which case no variable is needed.

  Never ask for or write the secret value itself.
- **`notes`**: surface these to the user (optional auth headers, post-install steps like jcodemunch's `index_folder`).
- **bundled rules**: if a chosen server has a companion rule file in [`references/rules/`](references/rules/) (currently `jcodemunch.md`), offer to copy it into the target project's `.claude/rules/` so its tool-selection guidance loads there. Only jcodemunch ships one today.

### 3. Preflight

- For any `stdio` server, check the dep's `command` is on `PATH` (`command -v <command>`). Warn if missing; the server will not launch without it. This covers registry servers and any custom stdio server the user defined in step 1.
- If a chosen server name already exists in the project's `apm.yml` under `dependencies.mcp`, tell the user it will be replaced and confirm before continuing.

### 4. Create agent trigger dirs

Most agents' project MCP writers only fire when that agent's config dir already exists, and skip silently otherwise. Before installing, `mkdir -p` the dir for each chosen agent in the project root: `.claude/`, `.cursor/`, `.gemini/`. Codex is the exception (it creates `.codex/` itself), but `mkdir -p .codex/` is a harmless no-op, so create it too for uniformity.

### 5. Merge into apm.yml

Build a JSON array of the resolved `dep` dicts and merge them into the project `apm.yml` with the helper (dedups by name, unions targets, preserves existing comments, creates the file if absent). The helper refuses to write a dep that still contains an unresolved `{{PLACEHOLDER}}`, so make sure step 2 filled every `prompts` value first:

```bash
uv run ~/.claude/skills/install-mcp/scripts/merge_apm_mcp.py \
  --project <project-dir> \
  --targets claude,cursor \
  --deps-json '[ {resolved dep}, ... ]'
```

### 6. Install

Run from the project directory:

```bash
apm install --only mcp
```

`--only mcp` guarantees only MCP servers are configured, so a project that already uses `apm.yml` for skills is unaffected. Add `--force` only when the user has confirmed overwriting an existing same-name server. Report apm's per-agent output ("Configured for Cursor, Claude...") verbatim, plus any secret still unset and any `notes` follow-ups.

## Notes

- [`references/servers.json`](references/servers.json) is the source of truth for the server set; its human companion is [`docs/mcp/project-servers.md`](../../../docs/mcp/project-servers.md). Update both when adding a server or changing connection details.
- Verified output paths (apm 0.25): Claude -> project `.mcp.json`, Cursor -> `.cursor/mcp.json`, Codex -> `.codex/config.toml`, Gemini -> `.gemini/settings.json`. Claude, Cursor, and Gemini need their dir pre-created (step 4); Codex does not. Always report apm's actual per-agent output rather than assuming.
