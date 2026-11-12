# pi agent directory

chezmoi renders this directory to `~/.pi/agent`, pi's user-scope configuration directory. It holds the settings file, the symlink that gives pi the Claude Code instructions, and the extensions that give it the Claude Code commands and rules. [`docs/agents/pi.md`](../../docs/agents/pi.md) is the overview.

## Directory layout

| Path                                       | What lives there                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`modify_settings.json`](docs/settings.md) | chezmoi modify script for `~/.pi/agent/settings.json`. Sets the provider and model, theme, the `skills` and `packages` arrays, and the model list. |
| `symlink_AGENTS.md`                        | Holds `../../.claude/CLAUDE.md`, so `~/.pi/agent/AGENTS.md` is the Claude Code instruction file. pi loads it in every project, trusted or not.     |
| [`extensions/`](extensions/README.md)      | One directory per extension, each with `index.ts`, a README, and implementation notes.                                                             |
| [`docs/`](docs/)                           | Configuration and usage notes. These stay in the repository and are not installed by chezmoi.                                                      |

### Instruction symlink

The symlink target is relative to the link, not to the home directory: chezmoi writes the file's content as the target verbatim, so `../../.claude/CLAUDE.md` resolves from `~/.pi/agent/` and a path written from `~` would dangle.

## Documentation

- [Settings](docs/settings.md): configured values, settings drift, merge behavior, and file removal.
- [Footer and context usage](docs/footer-and-context.md): footer layout, Codex quotas, saved changes, and context inspection.
- [Claude resources](docs/claude-resources.md): project approval, resource reloads, skill compatibility, and cache exclusions.
