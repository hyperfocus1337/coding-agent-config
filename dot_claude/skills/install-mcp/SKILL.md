---
name: install-mcp
description: Install a cross-agent MCP server at project, local, or user scope via apm.yml. Use when the user wants to add an MCP server (tessl, stitch, directus, claude-design, orbit, jcodemunch, jdocmunch, or a custom one) to a repo's .mcp.json / .cursor / .codex / .gemini config instead of copying templates by hand. Entry point is the install-agent-resources skill.
disable-model-invocation: true
---

# install-mcp

Installs MCP servers at a scope you choose: `project` (committed, every collaborator gets it on clone), `local` (gitignored, this machine only), or `user` (global, every session). It fans them out to whichever coding agents the user names (Claude Code, Cursor, Codex, Gemini, ...). All translation is delegated to `apm` via an `apm.yml`; this skill never hand-writes per-agent config formats. The available servers are cataloged for humans in [`docs/scope/mcp-servers.md`](../../../docs/scope/mcp-servers.md); the machine source this skill reads is [`references/servers.json`](references/servers.json).

## When to use

The user wants to add one or more MCP servers. Every server in the registry is a project candidate; user scope is the exception and is written back into the config repo. For skills use `install-skills`. For plugins use `install-plugins`.

## Inputs you gather (ask the user)

1. **Which server(s)** from the registry ([`references/servers.json`](references/servers.json)), or a custom one not listed.
2. **Which scope**: `project`, `local`, or `user`. Ask every time. Preselect `project`.
3. **Which agent(s)**: `claude`, `cursor`, `codex`, `gemini` (apm target names; others apm supports are fine too).
4. **Target project**: default to the current working directory unless told otherwise.

## The registry

[`references/servers.json`](references/servers.json) holds one entry per server, keyed by server name, under `servers`.

### Fields

| Field     | Meaning                                                                         |
| :-------- | :------------------------------------------------------------------------------ |
| `summary` | one line describing what the server does, shown when offering the choice        |
| `docs`    | upstream page for the connection details                                        |
| `dep`     | the apm.yml `dependencies.mcp` entry: `{name, registry: false, transport, ...}` |
| `secrets` | env var names the dep references as `${VAR}`, checked but never written         |
| `prompts` | values the user must supply: `key`, `target`, `ask`, optional `default`         |
| `notes`   | auth options and post-install steps to surface to the user                      |
| `rule`    | optional path to a rule file that improves how agents use this server, step 7   |

A `dep` is transport-shaped: `stdio` carries `command`, `args`, and optional `env`; `http` carries `url` and optional `headers`.

### How a row is used

The `dep` is the source of truth for the install command in step 6. Step 3 resolves it: `prompts` answers replace the `{{KEY}}` placeholders, `${VAR}` secrets stay literal. Every registry server is a project candidate. A user-scope server also needs a declaration in the config repo, see step 7.

## Procedure

### 0. Preflight the toolchain

Confirm `apm` is on `PATH` (`command -v apm`). Without it the install cannot run. Stop and tell the user how to install it.

### 1. Read the registry

Load [`references/servers.json`](references/servers.json). Show the user the available servers with their one-line `summary`, and ask which to install and for which agents. For a server not in the registry, ask the user for its transport and connection details (or point them at the upstream docs) and build an apm self-defined `dep` in the same shape (`{name, registry: false, transport, ...}`); stdio needs `command`/`args`, http needs `url`/`headers`.

### 2. Ask the scope

Present `project`, `local`, `user` with `project` preselected. State the consequence in one line each: project writes committed config that every collaborator gets on clone, local writes the same files and gitignores them, user configures every session on this machine and costs resident tokens.

`local` runs the project procedure, then adds each file apm wrote (`.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.gemini/settings.json`) to the project's `.gitignore`.

`user` replaces steps 4 to 7 with the user-scope procedure in step 8.

### 3. Resolve config per chosen server

For each selected server, take its `dep` and apply its fields:

| Field     | What to do                                                                                           |
| :-------- | :--------------------------------------------------------------------------------------------------- |
| `prompts` | ask the user, offering `default` if present, and substitute the answer for the `{{KEY}}` placeholder |
| `secrets` | leave every `${VAR}` exactly as written, then check whether it is set with `printenv VAR`            |
| `notes`   | surface to the user: optional auth headers, post-install steps like jcodemunch's `index_folder`      |

A `prompts` answer is baked in as a literal. A `${VAR}` is not: the agent interpolates it from the environment at launch.

#### An unset secret

Never ask for or write the secret value itself. Do not just warn either. Offer one of these:

- Scaffold a credentials file in the project root so there is one place to fill them in. Ask which the user prefers: `.envrc` (direnv style, `export VAR=` lines, matching this repo's own pattern; direnv loads it into the environment automatically so the agent picks it up at launch) or `.env` (plain `VAR=` lines; remind the user it only takes effect if their shell or tooling loads it before the agent starts). Append only the missing vars without duplicating an existing line, write empty placeholders and never real values, and tell the user to add the file to `.gitignore` if it is not already ignored.
- Point at the server's official auth flow when it has one (e.g. tessl's `tessl auth login`, per `notes`/`docs`), in which case no variable is needed.

### 4. Check the server's requirements

- For any `stdio` server, check the dep's `command` is on `PATH` (`command -v <command>`). Warn if missing; the server will not launch without it. This covers registry servers and any custom stdio server the user defined in step 1.
- If a chosen server name already exists in the project's `apm.yml` under `dependencies.mcp`, tell the user it will be replaced and confirm before continuing.

### 5. Create agent trigger dirs

Most agents' project MCP writers only fire when that agent's config dir already exists, and skip silently otherwise. Before installing, `mkdir -p` the dir for each chosen agent in the project root: `.claude/`, `.cursor/`, `.gemini/`. Codex is the exception (it creates `.codex/` itself), but `mkdir -p .codex/` is a harmless no-op, so create it too for uniformity.

### 6. Install

`apm mcp install` writes the server into `apm.yml` and configures the agents in one step. It needs an `apm.yml`, so create one first when the project has none:

```bash
apm init -y --target claude,cursor
```

Then install one server per command, mapping the resolved `dep` to the flags:

| `dep` field       | Command form                       |
| :---------------- | :--------------------------------- |
| `name`            | the positional argument            |
| `transport`       | `--transport stdio\|http`          |
| `url`             | `--url <value>`                    |
| `command`, `args` | after `--`, in order               |
| `env`             | one `--env KEY=VALUE` per entry    |
| `headers`         | one `--header KEY=VALUE` per entry |

```bash
apm mcp install tessl --transport stdio --env 'TESSL_TOKEN=${TESSL_TOKEN}' -- tessl mcp start
apm mcp install directus --transport http --url https://cms.example.com/mcp \
  --header 'Authorization=Bearer ${DIRECTUS_TOKEN}'
```

Single-quote every `${VAR}` so the shell does not expand it; the value must reach `apm.yml` literally. Never type a `{{PLACEHOLDER}}` into a command: step 3 substitutes the `prompts` answers first, and an unsubstituted placeholder writes a broken server config.

apm refuses a name that already exists in `apm.yml` and tells you to pass `--force`. Pass it only after the user confirms the replacement in step 4. `--force` replaces the whole entry, so re-state every flag the server needs.

`--target` selects which agents this command configures. It does not update the `targets:` list in `apm.yml`, which apm writes only when it creates the file. To add an agent for later bare installs, edit the list first:

```bash
yq -i '.targets = ((.targets // []) + ["gemini"] | unique)' apm.yml
```

Report apm's per-agent output ("Configured for Cursor, Claude...") verbatim, plus any secret still unset and any `notes` follow-ups.

### 7. Offer the server's rule file

Only for a server whose row carries a `rule`, and only for `project` or `local` scope. The rule belongs next to the server it describes: it tells agents in that repo which tools of the server to use and when, so it is worth nothing in a project that does not run the server.

Ask the user before copying. Show what the rule does, then:

```bash
mkdir -p <project-dir>/.claude/rules
cp ~/.claude/skills/install-mcp/<rule> <project-dir>/.claude/rules/<name>.md
```

Claude Code loads every file in `.claude/rules/` automatically, gated by the `paths:` glob in its frontmatter, so no import line is needed. Then ask whether to commit the file or gitignore it, matching the scope the user chose for the server itself.

Only jcodemunch ships a rule today. The rule files live in [`rules/`](rules/).

### 8. User scope

Only for `user` scope, and only after the user confirms the write. A user-scope server that is not declared in the config repo disappears on the next clean rebuild.

Locate the config repo in this order: `$AGENT_CONFIG_REPO`, then `/workspaces/coding-agent-config` if it exists, then ask.

Resolve the dep as in step 3, then run the same `apm mcp install` command from the config repo root so it writes that manifest, and install globally:

```bash
cd <config-repo>
apm mcp install <name> --transport http --url https://example.com/mcp
./scripts/extensions/apm/install.sh
```

That script stages the manifest into `~/.apm/` and runs `apm install -g --update --force`, because `apm install -g` reads `~/.apm/`, not the working directory. The root manifest carries its own `targets:` list, today `claude` only; another agent needs that agent added there, which fans every dep of the manifest out to it. Tell the user to commit the `apm.yml` change.

## Notes

- [`references/servers.json`](references/servers.json) is the source of truth for the server set; its human companion is [`docs/scope/mcp-servers.md`](../../../docs/scope/mcp-servers.md). Update both when adding a server or changing connection details.
- A new rule file goes in [`rules/`](rules/) and reaches a project only through the `rule` key of a server row. Nothing else reads that directory.
- Verified output paths (apm 0.25): Claude -> project `.mcp.json`, Cursor -> `.cursor/mcp.json`, Codex -> `.codex/config.toml`, Gemini -> `.gemini/settings.json`. Claude, Cursor, and Gemini need their dir pre-created (step 5); Codex does not. Always report apm's actual per-agent output rather than assuming.
