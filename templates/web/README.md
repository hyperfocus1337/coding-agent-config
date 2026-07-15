# Web bootstrap pack

Drop-in pack that brings the full coding-agent-config environment into a Claude Code cloud session, so a fresh repository opened on [claude.ai/code](https://claude.ai/code), on Android, or in CI gets the same skills, commands, hooks, plugins, and MCP servers as a local machine.

Cloud sessions start from a minimal base image. None of the config in this repo is present until something installs it. This pack wires a `SessionStart` hook that runs once at the beginning of every session and installs the config before the agent starts working.

Cloud sessions are usually ephemeral, so the hook re-runs from scratch every time. This pack installs the portable config plus the full APM manifest (skill bundles, MCP servers, and the pyright LSP). It deliberately skips the 21 Claude plugins from the marketplace and playwright browser binaries, which would push a per-session hook past 5 minutes. See [What gets installed](#what-gets-installed) for the exact scope, and [MCP servers and secrets](#mcp-servers-and-secrets) for the env vars the MCP servers need.

## What is in here

`bootstrap.sh` is the real installer. It is self-contained: it installs its own prerequisites (chezmoi, apm), clones this repo, applies the config, and installs the full APM manifest. It is hosted in this public repo and fetched raw over https, so it always runs the latest version and lives in exactly one place.

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
- **the full APM manifest** from [`apm.yml`](../../apm.yml): the third-party skill bundles, the MCP servers, and the pyright LSP, via `apm install -g` with no `--only` filter (see the [apm install reference](https://microsoft.github.io/apm/reference/cli/install/)). MCP servers that interpolate secrets register with whatever env vars are set at session start; see [MCP servers and secrets](#mcp-servers-and-secrets). The pyright LSP registers only if `pyright-langserver` is on `$PATH`.

It deliberately **skips**, to keep session start fast:

- the 21 Claude plugins from the marketplace
- playwright browser binaries

You keep every local skill, command, rule, hook, the APM skill bundles, and the APM MCP/LSP servers. You lose only the plugin-provided skills in cloud sessions. For the split between the chezmoi layer and the APM layer, see the root [README.md](../../README.md).

### Getting full parity

If a cloud session needs the full environment, run the complete chain manually once it has started:

```bash
~/coding-agent-config/scripts/extensions/install.sh
```

That adds the plugins, standalone skills, and playwright browsers on top of what the bootstrap already installed. It is the same entry point local `just setup` uses.

## MCP servers and secrets

The bootstrap registers the user-scoped MCP servers from [`apm.yml`](../../apm.yml). The ones that interpolate secrets (`${TESSL_TOKEN}`, `${CONTEXT7_API_KEY}`) register regardless, but only work if those env vars are set in the cloud environment before the session starts. An unset var leaves that server registered but non-functional; it does not fail the install. Set the vars in the platform's environment settings to activate them.

To also add project-scoped MCP servers, use the [`templates/mcp`](../mcp/) pack and its [`.mcp.json`](../mcp/.mcp.json), and set the referenced env vars in the cloud environment settings. Enabling MCP per platform is covered in [`docs/mcp/enabling/web.md`](../../docs/mcp/enabling/web.md).

## Lessons learned

The apm-related steps look unusual because a cloud session is not a normal shell. Three things bit us, and the fixes are why the script reads the way it does.

**apm installs from PyPI, not its official installer.** The documented way to install apm is `curl -sSL https://aka.ms/apm-unix | sh`, which downloads a release binary from the `microsoft/apm` GitHub repo. Cloud sessions scope GitHub access to only the session's whitelisted repo, so that download fails with "GitHub access to this repository is not enabled for this session. Use `add_repo` to request access." `add_repo` does not help here: it is an interactive, per-session grant, and the bootstrap runs unattended from the `SessionStart` hook before any interactive turn, so nothing is there to call it. It also only grants a repo's API, while the binary is a release asset served from a separate host that the grant may not cover. apm also ships as the `apm-cli` wheel on PyPI, which the proxy does reach, and the base image already has `uv`, so `uv tool install apm-cli` sidesteps GitHub entirely and needs no grant and no interaction.

**A failed apm step must not abort the rest.** The script runs under `set -euo pipefail`. apm is installed and used before the config clone and `chezmoi apply`, so when the apm install aborted, everything after it, the actually-portable config, never ran, and the failure was silent because `SessionStart` hook errors are not surfaced. Both apm invocations now warn and continue (`|| echo WARN`), so the config lands even when apm cannot.

**`apm install -g` reads a global manifest, not the project one.** `-g` installs to user scope from the global manifest at `~/.apm/apm.yml`, not from the `apm.yml` in the current directory. Some apm builds never read the project manifest under `-g` and abort with "No `~/.apm/apm.yml` found" even when run from inside the repo, which is why the earlier `cd "$REPO_DIR" && apm install -g` produced a complete-but-empty install. The script now copies the repo's `apm.yml` to `~/.apm/apm.yml` before installing, which is deterministic across builds and cwd. It also drops `--refresh`, which the [apm install reference](https://microsoft.github.io/apm/reference/cli/install/) documents as not valid with `--global`.

## Tips

- **Idempotent by design.** Cloud sessions may restart. Every prerequisite is guarded by `command -v`, and the repo is refreshed with fetch plus hard reset, so a re-run is cheap and safe.
- **Fail fast, except for apm.** The script runs under `set -euo pipefail`, so a failed prerequisite aborts before the agent proceeds without required tools. The two apm steps are the deliberate exception: they warn and continue so the portable config still lands when apm is unavailable (see [Lessons learned](#lessons-learned)).
- **Test before relying on it.** Run `bootstrap.sh` in a clean Debian or Ubuntu container with `CLAUDE_CODE_REMOTE=true` to catch missing dependencies before a live session hits them.
