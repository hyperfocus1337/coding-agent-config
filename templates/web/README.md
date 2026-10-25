# Web bootstrap pack

Drop-in pack that brings the full coding-agent-config environment into a Claude Code cloud session, so a fresh repository opened on [claude.ai/code](https://claude.ai/code), on Android, or in CI gets the same skills, commands, hooks, plugins, and MCP servers as a local machine.

Cloud sessions start from a minimal base image. None of the config in this repo is present until something installs it. This pack wires a `SessionStart` hook that runs once at the beginning of every session and installs the config before the agent starts working.

Cloud sessions are usually ephemeral, so the hook re-runs from scratch every time. This pack installs the portable config plus the cloud APM manifest in [`apm.yml`](apm.yml) (MCP servers and the pyright LSP, no skills). It deliberately skips the four user-scope Claude plugins from the marketplace and playwright browser binaries, which would push a per-session hook past 5 minutes. See [What gets installed](#what-gets-installed) for the exact scope, and [MCP servers and secrets](#mcp-servers-and-secrets) for the env vars the MCP servers need.

## What is in here

`bootstrap.sh` is the real installer. It is self-contained: it installs its own prerequisites (mise, the CLI tools in [`mise.toml`](mise.toml) such as chezmoi, and apm), clones this repo, applies the config, and installs the cloud APM manifest. It is hosted in this public repo and fetched raw over https, so it always runs the latest version and lives in exactly one place.

Do not move or rename `bootstrap.sh`. Its path is part of the hook URL in every repository already bootstrapped, and `raw.githubusercontent.com` does not redirect.

## Install into a fresh repo

Ask Claude to "bootstrap this repo for the web", or invoke the `install-agent-resources` skill. That routes to the `install-bootstrap` skill, which is also invocable by exact name.

The skill merges its [`assets/settings.json`](../../dot_claude/skills/install-bootstrap/assets/settings.json) into the target repo's `.claude/settings.json` and keeps every existing key. The file holds the `SessionStart` hook and the `attribution` settings, which hide the Claude Code attribution in commits and pull requests. A re-run does not add a second hook. Do not change the hook object: the merge matches it by value.

The skill asks for a settings profile. `minimal`, the default, also merges the deny list and the `disable*` keys of [`settings-minimal.json`](../../dot_claude/settings-minimal.json) into the same file, which locally the `claude` shell function adds with `--settings`. A cloud session has no such function, and the bootstrap hook cannot add the keys itself: Claude Code builds the permission rules before `SessionStart` runs. The keys apply to everyone who opens the repo with Claude Code. `full` merges `assets/settings.json` only.

Commit the change. The next cloud session that opens the repo runs the hook automatically.

That is all the target repo needs. The global hooks, plugins, and agent instructions come from `~/.claude`, which the bootstrap lays down with chezmoi. The target repo does not carry a copy of the bootstrap script, so there is nothing to keep in sync.

## How it works

The hook in [`assets/settings.json`](../../dot_claude/skills/install-bootstrap/assets/settings.json) is:

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

`bootstrap.sh` installs any missing prerequisites (mise and apm), clones this repo to `~/coding-agent-config`, and then:

- **mise install**, which installs the CLI tools in [`mise.toml`](mise.toml), such as chezmoi, from the URLs and checksums in [`mise.lock`](mise.lock). Each tool gets a symlink in `~/.local/bin`, and the script writes that folder to `CLAUDE_ENV_FILE`, so the session's Bash calls find mise, apm, and chezmoi after the hook exits.
- **chezmoi apply**, which lays down the whole `~/.claude` (commands, skills, rules, hooks, `CLAUDE.md`), plus `~/.config` and `~/.gemini`
- **node hook deps**, so the markdown and format hooks run
- **the cloud APM manifest** from [`apm.yml`](apm.yml): the MCP servers and the pyright LSP, but no skill bundles, via `apm install -g` (see the [apm install reference](https://microsoft.github.io/apm/reference/cli/install/)). MCP servers that interpolate secrets register with whatever env vars are set at session start; see [MCP servers and secrets](#mcp-servers-and-secrets). The pyright LSP registers only if `pyright-langserver` is on `$PATH`. apm writes the LSP as the plugin `~/.claude/skills/apm-lsp`, and Claude Code scans for plugins before the hook runs. To load the LSP in the session that ran the bootstrap, run `/reload-plugins --force`.

It deliberately **skips**, to keep session start fast:

- the four user-scope Claude plugins from the marketplace
- playwright browser binaries
- the statusline: `settings.json` gets no `statusLine` block and `~/.config/ccstatusline` is not written, because chezmoi gates both on `CLAUDE_CODE_REMOTE`

You keep every local skill, command, rule, hook, and the APM MCP/LSP servers. You lose the plugin-provided skills and the APM skill bundles from the root [`apm.yml`](../../apm.yml) in cloud sessions. For the split between the chezmoi layer and the APM layer, see the root [README.md](../../README.md).

### Getting full parity

If a cloud session needs the full environment, run the complete chain manually once it has started:

```bash
~/coding-agent-config/scripts/extensions/install.sh
```

That adds the plugins, standalone skills, and playwright browsers on top of what the bootstrap already installed. It is the same entry point `just extensions` runs locally.

## MCP servers and secrets

The bootstrap registers the user-scoped MCP servers from [`apm.yml`](apm.yml). The ones that interpolate secrets (`${CONTEXT7_API_KEY}`) register regardless, but only work if those env vars are set in the cloud environment before the session starts. An unset var leaves that server registered but non-functional; it does not fail the install. Set the vars in the platform's environment settings to activate them.

To also add project-scoped MCP servers, install them per-project with the `install-mcp` skill (catalog in [`docs/scope/mcp-servers.md`](../../docs/scope/mcp-servers.md)) and set the referenced env vars in the cloud environment settings. Enabling MCP per platform is covered in [`docs/mcp/enabling/web.md`](../../docs/mcp/enabling/web.md).

## Lessons learned

The prerequisite steps look unusual because a cloud session is not a normal shell. Four things bit us, and the fixes are why the script reads the way it does.

**apm installs from PyPI, not its official installer.** The documented way to install apm is `curl -sSL https://aka.ms/apm-unix | sh`, which downloads a release binary from the `microsoft/apm` GitHub repo. Cloud sessions scope GitHub access to only the session's whitelisted repo, so that download fails with "GitHub access to this repository is not enabled for this session. Use `add_repo` to request access." `add_repo` does not help here: it is an interactive, per-session grant, and the bootstrap runs unattended from the `SessionStart` hook before any interactive turn, so nothing is there to call it. It also only grants a repo's API, while the binary is a release asset served from a separate host that the grant may not cover. apm also ships as the `apm-cli` wheel on PyPI, which the proxy does reach, and the base image already has `uv`, so `uv tool install apm-cli` sidesteps GitHub entirely and needs no grant and no interaction.

**A failed apm step must not abort the rest.** The script runs under `set -euo pipefail`. apm is installed and used before the config clone and `chezmoi apply`, so when the apm install aborted, everything after it, the actually-portable config, never ran, and the failure was silent because `SessionStart` hook errors are not surfaced. Both apm invocations now warn and continue (`|| echo WARN`), so the config lands even when apm cannot.

**CLI tools install with mise in locked mode.** The `get.chezmoi.io` installer looks up its tag at `github.com/twpayne/chezmoi/releases/<tag>` before it downloads. The GitHub proxy only serves API requests for repositories attached to the session, so that lookup gets a 403. mise's aqua backend fails the same way: it reads release metadata from `mise-versions.jdx.dev`, which is not on the cloud allowlist, and then falls back to `api.github.com`. Only the `releases/download/` URLs go through.

The script installs mise from npm, then runs `mise install` with `MISE_LOCKED=true` against [`mise.toml`](mise.toml). Locked mode takes each download URL and sha256 checksum from [`mise.lock`](mise.lock), so mise makes no API or versions-host request. To add or upgrade a tool, edit `mise.toml`, run `mise lock --platform linux-x64,linux-arm64` in this folder, run `just cloud-tools-check`, and commit both files. A tool with no lockfile entry for the platform fails the install.

**`apm install -g` reads a global manifest, not the project one.** `-g` installs to user scope from the global manifest at `~/.apm/apm.yml`, not from the `apm.yml` in the current directory. Some apm builds never read the project manifest under `-g` and abort with "No `~/.apm/apm.yml` found" even when run from inside the repo, which is why the earlier `cd "$REPO_DIR" && apm install -g` produced a complete-but-empty install. The script now copies this folder's `apm.yml` to `~/.apm/apm.yml` before installing, which is deterministic across builds and cwd. It also drops `--refresh`, which the [apm install reference](https://microsoft.github.io/apm/reference/cli/install/) documents as not valid with `--global`.

## Tips

- **Idempotent by design.** Cloud sessions may restart. Every prerequisite is guarded by `command -v`, and the repo is refreshed with fetch plus hard reset, so a re-run is cheap and safe.
- **Fail fast, except for apm.** The script runs under `set -euo pipefail`, so a failed prerequisite aborts before the agent proceeds without required tools. The two apm steps are the deliberate exception: they warn and continue so the portable config still lands when apm is unavailable (see [Lessons learned](#lessons-learned)).
- **Test before relying on it.** Run `bootstrap.sh` in a clean Debian or Ubuntu container with `CLAUDE_CODE_REMOTE=true` to catch missing dependencies before a live session hits them.
