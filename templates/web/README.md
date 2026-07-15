# Web bootstrap pack

Drop-in pack that brings the full coding-agent-config environment into a Claude Code cloud session, so a fresh repository opened on [claude.ai/code](https://claude.ai/code), on Android, or in CI gets the same skills, commands, hooks, plugins, and MCP servers as a local machine.

Cloud sessions start from a minimal base image. None of the config in this repo is present until something installs it. This pack wires a `SessionStart` hook that runs once at the beginning of every session and installs everything before the agent starts working.

## What is in here

`bootstrap.sh` is the real installer. It is self-contained: it installs its own prerequisites (chezmoi, apm, uv), clones this repo, then runs the normal install chain. It is hosted in this public repo and fetched raw over https, so it always runs the latest version and lives in exactly one place.

`settings.json` is the tiny drop-in a fresh repo commits. It contains only the `SessionStart` hook that curls `bootstrap.sh`.

## Install into a fresh repo

Copy the settings file into the target repository:

```bash
cp templates/web/settings.json <target-repo>/.claude/settings.json
```

If the target repo already has a `.claude/settings.json`, merge the `SessionStart` block into it rather than overwriting. Commit the change. The next cloud session that opens the repo runs the hook automatically.

That is all the target repo needs. The global hooks, plugins, and agent instructions come from `~/.claude`, which the bootstrap lays down with chezmoi. The target repo does not carry a copy of the bootstrap script, so there is nothing to keep in sync.

## How it works

The hook command is:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "curl -fsSL https://raw.githubusercontent.com/hyperfocus1337/coding-agent-config/main/templates/web/bootstrap.sh | bash"
          }
        ]
      }
    ]
  }
}
```

Claude Code sets `CLAUDE_CODE_REMOTE=true` in cloud environments. `bootstrap.sh` guards on it and exits immediately anywhere else, so committing this pack is harmless for anyone who also opens the repo locally.

## What gets installed

`bootstrap.sh` installs any missing prerequisites, clones this repo to `~/coding-agent-config`, and then runs [`scripts/extensions/install.sh`](../../scripts/extensions/install.sh). That script is the same entry point used everywhere else, and it performs the full install:

- chezmoi apply, which lays down `~/.claude` (commands, skills, rules, hooks, `CLAUDE.md`), `~/.config`, and `~/.gemini`
- node dependencies for the node-based hooks
- Claude plugins via the marketplace
- standalone skills
- APM deps from [`apm.yml`](../../apm.yml): MCP servers and third-party skills

For the split between the chezmoi layer and the APM layer, see the root [README.md](../../README.md).

## Secrets and env vars

MCP servers declared in [`apm.yml`](../../apm.yml) interpolate secrets from the environment (for example `${CONTEXT7_API_KEY}`). Set the required variables in the cloud environment settings before the first session, or those servers will fail to authenticate. `apm.yml` is the source of truth for which variables are needed.

Project-scoped MCP servers are separate from this pack. To add servers scoped to a single project rather than user-wide, use the [`templates/mcp`](../mcp/) pack and its [`.mcp.json`](../mcp/.mcp.json). Enabling MCP servers per platform is covered in [`docs/mcp/enabling/web.md`](../../docs/mcp/enabling/web.md).

## Tips

- **Idempotent by design.** Cloud sessions may restart. Every prerequisite is guarded by `command -v`, and the repo is refreshed with fetch plus hard reset, so a re-run is cheap and safe.
- **Fail fast.** The script runs under `set -euo pipefail`, so a failed prerequisite install aborts before the agent proceeds without required tools.
- **Test before relying on it.** Run `bootstrap.sh` in a clean Debian or Ubuntu container with `CLAUDE_CODE_REMOTE=true` to catch missing dependencies before a live session hits them.
