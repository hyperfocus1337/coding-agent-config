# Integrating Claude Commands and Skills

This repository ships a `.claude/` directory containing slash commands, skills,
and a global `CLAUDE.md`. The sections below explain how each type of asset is
discovered by Claude Code, and the best approach for making all of them
available globally.

## How Claude Code discovers assets

Understanding the load paths matters before choosing an integration strategy:

| Asset             | Load paths                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| **Commands**      | `~/.claude/commands/` (personal, always loaded) · `.claude/commands/` in the current project directory |
| **Skills**        | `~/.claude/skills/` (personal) · `.claude/skills/` in directories added via `--add-dir` or `/add-dir`  |
| **CLAUDE.md**     | `~/.claude/CLAUDE.md` (global) · `CLAUDE.md` / `.claude/CLAUDE.md` in the current project              |
| **Hooks**         | Wired via `settings.json` — scripts can live anywhere; this repo stores them under `.claude/hooks/`    |
| **Status line**   | Wired via `settings.json`'s `statusLine` block — script lives at `~/.claude/statusline-command.sh`     |
| **settings.json** | `~/.claude/settings.json` (global) · `.claude/settings.json` in the current project                    |

The key asymmetry: **`--add-dir` loads skills but not commands.** Commands from
a `.claude/commands/` folder in an added directory are not picked up — they must
live under `~/.claude/commands/` or the current project's `.claude/commands/` to
be discovered.

---

## Prerequisites

Clone the repo to a stable location on your machine:

```bash
git clone https://github.com/your-org/claude-marketplace ~/repos/claude-marketplace
```

Keeping it up to date:

```bash
git -C ~/repos/claude-marketplace pull
```

---

## Approach 1: Symlink into `~/.claude` (recommended for both commands and skills)

Symlinking is the only approach that makes **both commands and skills**
available globally with zero per-session effort.

### Automated setup

A setup script handles all of the steps below for you:

```bash
./docs/integration/symlink.sh
```

By default it resolves the repo root from the script's own location. To run it
from anywhere, or to point at a different clone, set `REPO` explicitly:

```bash
REPO=~/repos/claude-marketplace ./docs/integration/symlink.sh
```

The script is idempotent — re-running it after a clone move or a new top-level
command/skill directory is added is safe.

### Manual steps

If you prefer to wire things up by hand:

```bash
# Create ~/.claude if it doesn't exist yet
mkdir -p ~/.claude/commands ~/.claude/skills

# Commands — symlink each group directly into the personal commands load path
ln -s ~/repos/claude-marketplace/.claude/commands/git ~/.claude/commands/git
ln -s ~/repos/claude-marketplace/.claude/commands/issues ~/.claude/commands/issues
ln -s ~/repos/claude-marketplace/.claude/commands/simple ~/.claude/commands/simple

# Skills — symlink each skill directly into the personal skills load path
ln -s ~/repos/claude-marketplace/.claude/skills/gh-cli ~/.claude/skills/gh-cli

# Hooks — symlink the whole directory; settings.json references scripts by absolute $HOME path
ln -s ~/repos/claude-marketplace/.claude/hooks ~/.claude/hooks

# Status line — referenced from settings.json by absolute $HOME path
ln -s ~/repos/claude-marketplace/.claude/statusline-command.sh ~/.claude/statusline-command.sh
```

### CLAUDE.md

```bash
# If you don't have a ~/.claude/CLAUDE.md yet
ln -s ~/repos/claude-marketplace/.claude/CLAUDE.md ~/.claude/CLAUDE.md
```

If you already have your own `~/.claude/CLAUDE.md`, append the contents manually
rather than symlinking — symlinking would replace your existing file.

### settings.json

```bash
# If you don't have a ~/.claude/settings.json yet
ln -s ~/repos/claude-marketplace/.claude/settings.json ~/.claude/settings.json
```

If you already have your own `~/.claude/settings.json`, merge the repo's `hooks`
block into it by hand — symlinking would replace your existing config.

**Best for:** permanent, always-on global integration. Changes from `git pull`
are immediately live with no further steps.

---

## Approach 2: `--add-dir` flag (skills only)

`--add-dir` grants Claude Code file access to the given directory and loads
**skills** from its `.claude/skills/` subfolder. Commands in `.claude/commands/`
of the added directory are **not** loaded by this mechanism.

```bash
claude --add-dir ~/repos/claude-marketplace
```

You can also add a directory mid-session:

```
/add-dir ~/repos/claude-marketplace
```

To avoid typing the flag each time, alias it in your shell:

```bash
# ~/.zshrc or ~/.bashrc
alias claude='claude --add-dir ~/repos/claude-marketplace'
```

**Best for:** making the skills available in a specific context, or testing
skill changes without modifying `~/.claude`. If you also need the commands, pair
this with symlinks for the `commands/` subdirectories (or run the setup script).

---

## Comparison

|                                   | Symlink                 | `--add-dir` flag      |
| --------------------------------- | ----------------------- | --------------------- |
| Loads commands                    | Yes                     | **No**                |
| Loads skills                      | Yes                     | Yes                   |
| Persistent across sessions        | Yes                     | Only with shell alias |
| Merges into `~/.claude` structure | Yes                     | No                    |
| Supports multiple repos           | Yes (multiple symlinks) | Yes (multiple flags)  |
| Requires config file changes      | No                      | No                    |
| Mid-session activation            | No (always on)          | Yes (`/add-dir`)      |
| Good for testing                  | No                      | Skills only           |

---

## What gets loaded

| Asset                                  | Symlink               | `--add-dir` |
| -------------------------------------- | --------------------- | ----------- |
| Slash commands (e.g. `/git:changelog`) | Yes                   | No          |
| Skills (e.g. `gh-cli`)                 | Yes                   | Yes         |
| CLAUDE.md global instructions          | Yes (or manual merge) | No          |
| Hooks (e.g. markdown auto-format)      | Yes (or manual merge) | No          |
| Status line script                     | Yes (or manual merge) | No          |

See [`.claude/README.md`](../.claude/README.md) for the full list of available
commands and skills.
