# claude-project

Coordinates approval for local Claude commands, rules, and skills. It does not load any of those resources itself.

At `session_start`, it checks `<cwd>/.claude/commands`, `<cwd>/.claude/rules`, and `<cwd>/.claude/skills`. It emits `claude-project` on pi's shared event bus with the approved `.claude` directory, or `undefined` when resources are absent or approval is denied. Each resource extension subscribes during factory initialization, so extension load order does not matter.

## Approval

Approval follows `--approve` or `--no-approve`, pi's saved `/trust` decision, then the global `defaultProjectTrust` setting. If the setting is `ask`, the TUI asks for approval for this session; non-interactive modes skip local resources. Use `/trust` to save a decision, or `pi --approve` for an explicit automated run. Pi does not include `.claude` directories in its built-in project-resource detection, so the coordinator checks them separately.

Run pi from the project root. The coordinator does not search ancestor directories and does not treat `~/.claude` as project configuration when pi starts in the home directory. Run `/reload` after adding resources.

User resources remain available without the coordinator. Enable any combination of `claude-commands`, `claude-rules`, and `claude-skills` alongside it for local resources.

## Checks

Run `node test/check.ts` or `just pi-check`. The checks cover resource detection, the home-directory guard, explicit approval and denial, and one announcement per session start.

See [implementation notes](docs/implementation.md) for the event contract.
