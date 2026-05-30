# claude-marketplace

Personal Claude Code plugins, skills, and integration docs — a self-hosted marketplace for AI tooling configuration.

## Motivation

Coding agent configuration tends to drift in different contexts. This repository contains Claude config that provides a single source of truth that keeps the setup consistent across all of them:

| Environment               | Notes                                                                                                                           |
|---------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| GitHub Actions            | CI/CD workflows use this repo to bootstrap                                                                                      |
| Claude on the web         | Shared config synced via this repository                                                                                        |
| Claude CLI (local macOS)  | Installed on the MacBook and configured from this repo                                                                          |
| Claude CLI (devcontainer) | Cannot share config with the local macOS install due to path and OS compatibility differences — this container bridges that gap |

By centralising tools, plugins, MCP servers, shell config, and agent instructions here, any change propagates to all environments by simply pulling the latest config (after it's been symlinked by `scripts/sync/symlink.sh`).

## Structure

```
.
├── .claude/          # Portable Claude Code config (commands, skills, CLAUDE.md)
├── .claude-plugin/   # Marketplace plugin registry (marketplace.json)
└── docs/             # Integration guides and setup instructions
```

## Contents

### `.claude/`

Portable Claude Code configuration — commands, skills, and a global `CLAUDE.md` — designed to be symlinked into any project. See [`.claude/README.md`](.claude/README.md) for the full breakdown.

### `.claude-plugin/`

The marketplace plugin registry (`marketplace.json`) that defines this repo as a Claude Code plugin source, enabling `claude plugin marketplace add` to pull from it.

### `docs/`

Platform-specific MCP server setup guides and plugin installation references. See [`docs/README.md`](docs/README.md) for the full breakdown.
