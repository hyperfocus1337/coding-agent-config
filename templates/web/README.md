# Web bootstrap pack

Drop-in pack that brings the full coding-agent-config environment into a Claude Code cloud session, so a fresh repository opened on [claude.ai/code](https://claude.ai/code), on Android, or in CI gets the same skills, commands, hooks, plugins, and MCP servers as a local machine.

Cloud sessions start from a minimal base image. None of the config in this repo is present until something installs it. This pack wires a `SessionStart` hook that runs once at the beginning of every session and installs the config before the agent starts working.

It is a **lite** install by design: cloud sessions are usually ephemeral, so the hook re-runs from scratch every time. A full-parity install (all 21 Claude plugins, playwright browsers, MCP and LSP servers) takes 5 to 12 minutes per session, which is too slow for a per-session hook. This pack installs only the portable config and the APM skill bundles, which lands in roughly 1 to 2 minutes. See [What gets installed](#what-gets-installed) for the exact scope and how to get full parity when you need it.

## What is in here

`bootstrap.sh` is the real installer. It is self-contained: it installs its own prerequisites (chezmoi, apm), clones this repo, applies the config, and installs the APM skills. It is hosted in this public repo and fetched raw over https, so it always runs the latest version and lives in exactly one place.

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

`bootstrap.sh` installs any missing prerequisites (chezmoi, apm), clones this repo to `~/coding-agent-config`, and then:

- **chezmoi apply**, which lays down the whole `~/.claude` (commands, skills, rules, hooks, `CLAUDE.md`, statusline), plus `~/.config` and `~/.gemini`
- **node hook deps**, so the markdown and format hooks run
- **APM skills** from [`apm.yml`](../../apm.yml): the third-party skill bundles only, via `apm install --only apm`, which restricts the install to the `dependencies.apm` block and skips `mcp:` and `lsp:` (see the [apm install reference](https://microsoft.github.io/apm/reference/cli/install/))

It deliberately **skips**, to keep session start fast:

- the 21 Claude plugins from the marketplace
- playwright browser binaries
- MCP servers and the pyright LSP

You keep every local skill, command, rule, hook, and the APM skill bundles. You lose the plugin-provided skills and the MCP tools in cloud sessions. For the split between the chezmoi layer and the APM layer, see the root [README.md](../../README.md).

### Getting full parity

If a cloud session needs the full environment, run the complete chain manually once it has started:

```bash
~/coding-agent-config/scripts/extensions/install.sh
```

That installs the plugins, standalone skills, and all APM deps (MCP + LSP included). It is the same entry point local `just setup` uses.

## MCP servers and secrets

The lite install registers no MCP servers, so no secrets are needed for it to run. To add MCP servers to a cloud session:

- **Project-scoped:** use the [`templates/mcp`](../mcp/) pack and its [`.mcp.json`](../mcp/.mcp.json), and set the referenced env vars in the cloud environment settings. Enabling MCP per platform is covered in [`docs/mcp/enabling/web.md`](../../docs/mcp/enabling/web.md).
- **User-scoped (all the servers in [`apm.yml`](../../apm.yml)):** run the full-parity chain above, and set the env vars those servers interpolate (for example `${CONTEXT7_API_KEY}`) beforehand.

## Tips

- **Idempotent by design.** Cloud sessions may restart. Every prerequisite is guarded by `command -v`, and the repo is refreshed with fetch plus hard reset, so a re-run is cheap and safe.
- **Fail fast.** The script runs under `set -euo pipefail`, so a failed prerequisite install aborts before the agent proceeds without required tools.
- **Test before relying on it.** Run `bootstrap.sh` in a clean Debian or Ubuntu container with `CLAUDE_CODE_REMOTE=true` to catch missing dependencies before a live session hits them.
