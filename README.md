# coding-agent-config

Single source of truth for coding-agent dependencies: skills, MCP servers, plugins, hooks, and agent instructions. Installs them consistently across every environment where an agent runs.

## Motivation

Coding-agent configuration drifts across contexts. This repository centralises it so any change propagates everywhere by pulling the latest config and applying it:

| Environment               | Notes                                                                                                       |
|---------------------------|-------------------------------------------------------------------------------------------------------------|
| GitHub Actions            | CI/CD workflows use this repo to bootstrap                                                                  |
| Claude on the web         | Shared config synced via this repository (bootstrap a repo with the [`templates/web`](templates/web/) pack) |
| Claude CLI (local macOS)  | Installed on the MacBook and configured from this repo                                                      |
| Claude CLI (devcontainer) | Cannot share config with the local macOS install due to path and OS compatibility differences               |

## Two install paths

The repo installs dependencies two ways, each covering a different layer.

### chezmoi: files into `$HOME`

The repo root is a [chezmoi](https://www.chezmoi.io/) source directory. Source names map to home paths (`dot_claude/` becomes `~/.claude`, `dot_config/` becomes `~/.config`, `dot_gemini/` becomes `~/.gemini`). Applying it lays down portable config that is just files: commands, skills, rules, hooks, statusline, and global agent instructions.

```
just chezmoi        # apply repo to $HOME
just chezmoi-diff   # preview without writing
```

### APM: cross-agent dependencies

APM (agent package manager) resolves the deps that are not plain files: third-party skills pulled from git and MCP servers. `apm.yml` is the manifest, and `targets:` decides which agent platforms they fan out to (Claude today, Gemini/Codex/Cursor later). No lockfile is committed: install re-resolves refs to latest upstream every run, so you always get the newest skills. Secrets stay out of the manifest by resolving from the environment at install time. Every way a skill reaches an agent (local files, plugins, standalone CLIs, and the APM bundle) is mapped in [`docs/sources/channels.md`](docs/sources/channels.md).

```
just apm-install    # deploy apm.yml deps to user scope (latest upstream)
just apm-diff       # preview without writing
just apm-list       # show installed deps
```

## Setup

```
just setup          # chezmoi apply + install plugins, MCP servers, deps
just update         # git pull, then re-run setup
```

Run `just` with no arguments to list every recipe.

## Structure

```
.
├── apm.yml           # Cross-agent dependency manifest (skills + MCP servers)
├── Justfile          # Install, sync, lint, and package recipes
├── dot_claude/       # Portable Claude Code config (commands, skills, hooks, rules, CLAUDE.md)
├── dot_config/       # ~/.config entries (e.g. ccstatusline)
├── dot_gemini/       # Gemini CLI config
├── scripts/          # Install/bootstrap scripts (extensions/, apm/)
├── templates/        # Copyable config: mcp/ (project MCP) and web/ (cloud bootstrap pack)
└── docs/             # Integration guides (apm/, agents/, mcp/)
```

See [`dot_claude/README.md`](dot_claude/README.md) and [`docs/README.md`](docs/README.md) for the detailed breakdowns.
