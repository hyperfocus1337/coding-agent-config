# coding-agent-config

Single source of truth for coding-agent dependencies: skills, MCP servers, plugins, hooks, and agent instructions. Installs them consistently across every environment where an agent runs.

## Motivation

Coding-agent configuration drifts across contexts. This repository centralises it so any change propagates everywhere by pulling the latest config and applying it:

| Environment               | Notes                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions            | CI/CD workflows use this repo to bootstrap                                                                                            |
| Claude on the web         | Shared config synced via this repository (bootstrap a repo with the `install-bootstrap` skill, see [`templates/web`](templates/web/)) |
| Claude CLI (local macOS)  | Installed on the MacBook and configured from this repo                                                                                |
| Claude CLI (devcontainer) | Cannot share config with the local macOS install due to path and OS compatibility differences                                         |

## Two install paths

The repo installs dependencies two ways, each covering a different layer.

### chezmoi: files into `$HOME`

The repo root is a [chezmoi](https://www.chezmoi.io/) source directory. Source names map to home paths: `dot_claude/` becomes `~/.claude`, `dot_config/` becomes `~/.config`. Applying it lays down portable config that is just files: commands, skills, rules, hooks, statusline, and global agent instructions.

```
just chezmoi        # apply repo to $HOME
just chezmoi-diff   # preview without writing
```

What lands in `~/.claude` is documented next to the files, one README per directory: [rules](dot_claude/rules/README.md), [commands](dot_claude/commands/README.md), [skills](dot_claude/skills/README.md), [hooks](dot_claude/hooks/README.md). [`dot_claude/README.md`](dot_claude/README.md) indexes them.

### APM: cross-agent dependencies

APM (agent package manager) resolves the deps that are not plain files: third-party skills pulled from git and MCP servers. `apm.yml` is the manifest, and `targets:` decides which agent platforms they fan out to (Claude today, Gemini/Codex/Cursor later). No lockfile is committed: install re-resolves refs to latest upstream every run, so you always get the newest skills. Secrets stay out of the manifest by resolving from the environment at install time. Every way a skill reaches an agent (local files, plugins, standalone CLIs, and the APM bundle) is mapped in [`docs/sources/channels.md`](docs/sources/channels.md).

```
just apm            # deploy apm.yml deps to user scope (latest upstream)
just apm-diff       # preview without writing
just apm-list       # show deps resolved in the lockfile
```

## Setup

```
just extensions     # chezmoi apply + node hook deps + Claude plugins + APM deps
just pull           # pull the repo, then re-run chezmoi (light, local only)
just update-all     # pull, then refresh locally and inside the devcontainer
```

The `chezmoi`, `apm`, and `extensions` recipes each have a `-devcontainer` and an `-all` variant, so the same state can be applied to the host, the container, or both.

Run `just` with no arguments to list every recipe.

## Structure

```
.
├── apm.yml           # Cross-agent dependency manifest (skills + MCP servers)
├── Justfile          # Install, sync, lint, and package recipes
├── dot_claude/       # Portable Claude Code config (commands, skills, hooks, rules, CLAUDE.md)
├── dot_config/       # ~/.config entries (currently the ccstatusline settings)
├── scripts/          # Install/bootstrap scripts (extensions/, apm/)
├── templates/        # Copyable config: mcp/ (project MCP) and web/ (cloud bootstrap pack)
└── docs/             # Integration guides (sdlc/, sources/, scope/, mcp/, research/)
```

See [`dot_claude/README.md`](dot_claude/README.md) and [`docs/README.md`](docs/README.md) for the detailed breakdowns.
