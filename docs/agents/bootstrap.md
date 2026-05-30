# Bootstrapping Remote Agent Environments

When Claude Code runs in a remote environment — such as [claude.ai/code](https://claude.ai/code) on the web, a CI/CD runner, or an ephemeral cloud container — it starts with a minimal base image. Tools, runtimes, CLI utilities, and personal configuration that exist on a local machine are not present by default.

Bootstrapping solves this: a script runs once at session start to install dependencies, apply configuration, and wire up any integrations the agent needs before it starts working.

---

## How It Works

The mechanism has two parts:

1. **A `SessionStart` hook** in `.claude/settings.json` that runs a shell script at the beginning of every session.
2. **A guard clause** inside that script that exits immediately if the session is not remote, so local environments are unaffected.

### 1. Register the Hook

In your project's `.claude/settings.json`, add a `SessionStart` hook pointing to your bootstrap script:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/bootstrap.sh"
          }
        ]
      }
    ]
  }
}
```

`$CLAUDE_PROJECT_DIR` resolves to the root of your project, so the path is portable regardless of where the repo is cloned.

### 2. Guard Against Local Execution

Claude Code sets `CLAUDE_CODE_REMOTE=true` when running in a remote environment. Use this as a guard at the top of your script:

```bash
#!/bin/bash

# Only run in remote environments
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

# ... rest of bootstrap steps
```

This ensures the script is a no-op on your local machine, where the tools and configuration already exist.

---

## What to Bootstrap

The contents of your bootstrap script depend on your project's needs. Common categories are outlined below.

### System Dependencies

Install any CLI tools, package managers, or system packages that are not present in the base image:

```bash
# Example: installing a package manager tool via its install script
curl -fsSL https://example.com/install.sh | sh

# Example: installing a system package via apt
apt update && apt install -y some-package
```

Some tools publish official install instructions for Debian/Ubuntu-based systems (which most remote Claude Code environments use). Follow those when available, as they set up the correct package signing keys and sources.

### Language Runtimes and Project Dependencies

If your project uses a specific language runtime or dependency manager, sync the environment:

```bash
# Example: activate a Python virtual environment and install dependencies
source .venv/bin/activate
uv sync

# Example: install Node.js dependencies
npm ci
```

### Personal Configuration

One of the most powerful uses of bootstrapping is pulling your personal Claude configuration into the remote session. This lets you use the same commands, skills, MCP servers, and agent instructions everywhere.

A common pattern is to clone a configuration repository and then run an integration script that symlinks the relevant files into `~/.claude`:

```bash
# Clone your config repository
git clone https://github.com/your-username/your-config-repo.git /root/my-config

# Run an integration script that symlinks commands, skills, CLAUDE.md, etc.
REPO=/root/my-config /root/my-config/scripts/sync/symlink.sh
```

The integration script (e.g. `symlink.sh`) would create the necessary symlinks from your cloned repo into `~/.claude`, making your commands and skills available globally to the agent. See [`scripts/sync/symlink.sh`](../../scripts/sync/symlink.sh) for a reference implementation.

### Specialised CLI Tools

If your workflow depends on specific tools that are not pre-installed, install them as part of the bootstrap:

```bash
# Example: install a tool via a package manager
uv tool install some-tool

# Example: install a tool distributed via a shell installer
curl -fsSL https://tool-provider.io/install | sh
```

---

## Full Example

Here is a complete bootstrap script illustrating the pattern:

```bash
#!/bin/bash

# Only run in remote environments
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

# ── Specialised tools ─────────────────────────────────────────────────────────
# Install tools your workflow depends on
uv tool install my-analysis-tool
curl -fsSL https://get.my-platform.io | sh

# ── Personal configuration ────────────────────────────────────────────────────
# Clone your config repo and wire it up
git clone https://github.com/your-username/your-config-repo.git /root/my-config
REPO=/root/my-config /root/my-config/scripts/sync/symlink.sh

# ── Project dependencies ──────────────────────────────────────────────────────
source .venv/bin/activate
uv sync

exit 0
```

---

## Enabling MCP Servers

Beyond the bootstrap script, you can configure which MCP servers are enabled for the session via `.claude/settings.json`. This is evaluated before the session begins, so your tools and permissions are ready from the first turn.

**`.mcp.json`** — defines the servers themselves (endpoints, auth, transport):

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "Authorization": "Bearer ${CONTEXT7_SECRET_KEY}"
      }
    }
  }
}
```

Environment variables in `headers` (e.g. `${CONTEXT7_SECRET_KEY}`) are expanded at runtime. Store secrets as environment variables rather than hardcoding them in the file.

**`.claude/settings.json`** — controls which of those servers are active and which tool calls are pre-approved:

```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["context7", "github"],
  "permissions": {
    "allow": ["mcp__context7__query-docs", "mcp__context7__resolve-library-id"]
  }
}
```

Adjust `enabledMcpjsonServers` to match the server keys defined in `.mcp.json` and the `permissions.allow` list to pre-approve any tool calls the agent should be able to make without user confirmation.

---

## Tips

- **Keep the script idempotent.** Remote sessions may be restarted. Installing tools with `--yes` flags or checking for existence before installing avoids redundant work and noisy output.
- **Fail fast on critical steps.** Use `set -e` or explicit error checks so a failed install doesn't silently allow the agent to proceed without required tools.
- **Separate concerns.** Keep the bootstrap script focused on environment setup. Project-specific agent instructions belong in `CLAUDE.md`, and tool configurations belong in `.claude/settings.json`.
- **Test the script manually.** Before relying on it in a live session, run the script in an equivalent container or CI environment to catch missing dependencies early.
