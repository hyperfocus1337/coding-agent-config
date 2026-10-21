# block-destructive-commands

Blocks a shell command that [dcg](https://github.com/Dicklesworthstone/destructive_command_guard) (destructive_command_guard) denies, for example `git reset --hard`, `rm -rf` outside a temporary directory, or `DROP TABLE`. dcg is a Rust binary with its own rule packs. This folder holds only the pi and omp adapter. Claude Code and Codex run the binary directly as a command hook.

| Agent       | Adapter                                                                          | Loaded by                                                                                          |
| ----------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | `~/.local/bin/dcg`, `PreToolUse` on `Bash\|PowerShell\|Monitor`, the first entry | `hooks` in `dot_claude/settings.json.tmpl`                                                         |
| Codex       | `"$HOME/.local/bin/dcg"`, the first `PreToolUse` handler on `Bash`               | `dot_codex/modify_hooks.json`                                                                      |
| pi and omp  | [`pi.ts`](pi.ts): `tool_call` on bash returns `{ block, reason }`                | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |

## Install

chezmoi installs the binary at `~/.local/bin/dcg` from [`.chezmoiexternal.toml`](../../../.chezmoiexternal.toml). It downloads the release tarball for the machine (macOS or Linux, arm64 or amd64) and refuses it when the SHA256 is not the pinned value. The upstream `install.sh` is not used, because it edits each agent's config file in `$HOME`, and the next `just chezmoi` overwrites those edits.

To upgrade, set `$dcgVersion` in `.chezmoiexternal.toml`, copy the four checksums from the `SHA256SUMS` asset of the release, and run `just chezmoi-all`.

Codex runs a new hook only after you trust it: open `/hooks` in Codex once after the first apply.

## Failure behavior

The hook fails open. When dcg is missing, exits with an error (exit 3 or more), or runs longer than 5 s, the command runs:

- **Claude Code and Codex** treat a command hook that cannot start or that times out as a non-blocking error.
- **pi and omp:** [`core.ts`](core.ts) blocks only on exit 1. Any other result allows the call.

## pi and omp

`pi.ts` follows the pi recipe in the dcg repository, [`docs/pi-integration.md`](https://github.com/Dicklesworthstone/destructive_command_guard/blob/main/docs/pi-integration.md). It runs `dcg --robot test --dialect posix <command>` in the session directory. `--dialect posix` is the dialect of the Claude Code Bash hook. Without it, dcg also reads the command as zsh and can deny commands that Bash allows.

omp loads the same `pi.ts`, not the extension that `dcg install --omp` writes. That generated file holds the absolute path of the binary, which is different on the host and in the devcontainer, and it changes with each dcg release. Two consequences:

- `dcg doctor` reports the omp extension as missing.
- A local PTY call in omp (`pty: true`) through a cmd or PowerShell shell is checked as POSIX. The generated extension maps that shell to its own dialect.

## Configuration

dcg reads `~/.config/dcg/config.toml` and a `.dcg.toml` in the project. This repository tracks the first one as [`dot_config/dcg/config.toml`](../../../dot_config/dcg/config.toml). Its [README](../../../dot_config/dcg/README.md) explains each enabled pack and why some packs stay disabled. Its [Exceptions](../../../dot_config/dcg/README.md#exceptions) section tells you how to allow a blocked command. `dcg explain "<command>"` shows the rule that blocks a command.

## Tests

```
node test/check.ts
```

from this folder, or `just hooks-check`. The check tests `core.ts` with stub dcg results, `io.ts` with stub dcg scripts, and `pi.ts` with a stub pi. The last group runs the installed `~/.local/bin/dcg` on `git reset --hard HEAD~1` and on `ls -la`, and is skipped when the binary is missing.

## Files

| File                             | Role                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| [`core.ts`](core.ts)             | Turns the dcg exit code and JSON into a block reason.      |
| [`io.ts`](io.ts)                 | Runs `~/.local/bin/dcg` in robot mode, with a 5 s timeout. |
| [`pi.ts`](pi.ts)                 | The pi and omp extension.                                  |
| [`test/check.ts`](test/check.ts) | The self-check.                                            |
