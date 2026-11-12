# Claude CLI

Shell entry points for launch modes and user rule filters:

- [`claude.sh`](claude.sh): Bash and Zsh functions. Source the installed file from your shell configuration:

  ```sh
  . ~/.claude/cli/claude.sh
  ```

- [`launch.sh`](launch.sh): shared Bash launcher for all three shells.
- [Fish functions](../../dot_config/fish/conf.d/claude.fish): loaded automatically from `~/.config/fish/conf.d/claude.fish`.

See [launch modes](../docs/launch-modes.md) for commands, filters, and limits.
