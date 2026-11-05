# block-destructive-commands

Blocks a shell command that [dcg](https://github.com/Dicklesworthstone/destructive_command_guard) (destructive_command_guard) denies, for example `git reset --hard`, `rm -rf` outside a temporary directory, or `DROP TABLE`. dcg is a Rust binary with its own rule packs. This folder holds the pi and omp adapter and a shell wrapper for Claude Code and Codex. Each adapter checks the standard hook toggles before it runs dcg.

| Agent       | Adapter                                                                                    | Loaded by                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`guard.sh --ask`](guard.sh), `PreToolUse` on `Bash\|PowerShell\|Monitor`, the first entry | `hooks` in `dot_claude/private_settings.json.tmpl`                                                 |
| Codex       | [`guard.sh`](guard.sh), the first `PreToolUse` handler on `Bash`                           | `dot_codex/modify_hooks.json`                                                                      |
| pi and omp  | [`pi.ts`](pi.ts): `tool_call` on bash returns `{ block, reason }`                          | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |

## Install

This repository does not install dcg. mise installs it from the `github:Dicklesworthstone/destructive_command_guard` pin in three places, and each one links the binary to `~/.local/bin/dcg`, the path that every hook runs:

| Environment  | Pin                                                                                   | Link made by                                          |
| ------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Host         | `dot_config/mise/config.toml` in the chezmoi dotfiles repository                      | `postinstall` of the pin                              |
| Devcontainer | `mise.toml` in the coding-agent-sandbox repository, installed by `Dockerfile.tooling` | `postinstall` of the pin                              |
| Cloud        | [`templates/web/mise.toml`](../../../templates/web/mise.toml)                         | [`bootstrap.sh`](../../../templates/web/bootstrap.sh) |

The hooks run the link by its full path, not through `PATH`, so the guard also runs when the agent starts without `~/.local/bin` on `PATH`. They do not run the mise shim: in a project with an untrusted mise config, the shim exits 1 before dcg starts. `postinstall` runs only when mise installs dcg. When the link is missing, run `mise install -f github:Dicklesworthstone/destructive_command_guard`. The upstream `install.sh` is not used, because it edits each agent's config file in `$HOME`, and the next `just chezmoi` overwrites those edits.

Each hook sets `DCG_NO_SELF_HEAL=1`. dcg resolves the link to the versioned install path. Without the variable, it can rewrite its Claude Code hook to that path, which the next upgrade breaks.

To upgrade, change the version in the three pins. The monthly `mise-bump` script bumps the host pin. For the cloud pin, run `just cloud-tools-bump`, which copies the host pin and locks it (see [`templates/web/README.md`](../../../templates/web/README.md)). Then change the tag in the links of [`dot_config/dcg/README.md`](../../../dot_config/dcg/README.md).

Codex runs a new hook only after you trust it: open `/hooks` in Codex once after the first apply.

## Failure behavior

The hook fails closed. A missing dcg binary, execution error, invalid JSON, or a run longer than 5 s blocks the command. An explicit hook toggle still skips the check.

- **Claude Code:** the command handler sets `onFailure: "block"`, which requires Claude Code 2.1.295 or later. This also blocks if the wrapper cannot start or reaches the outer 10 s timeout.
- **Claude Code and Codex:** [`guard.sh`](guard.sh) uses Node to run dcg with a 5 s timeout and converts nonzero exits and execution failures to blocking exit 2. It preserves successful dcg output, including JSON denials and approval codes. Node must be on `PATH`; a missing Node blocks too. The outer hook timeout is 10 s so the wrapper can report its internal timeout first.
- **Codex limitation:** a failure to start the wrapper itself, or an outer hook timeout, can still fail open. The wrapper cannot handle a failure outside its own process.
- **pi and omp:** [`core.ts`](core.ts) blocks on a hook JSON `permissionDecision: "deny"`, exit 1, execution failures, timeouts, and invalid responses. Exit 0 with empty output, `{}`, or an explicit allow passes.

## Fast approval

A confirmable denial first goes to the agent, with the full dcg reason and a hint: look for a safer command that reaches the same goal, and run the denied command again unchanged only if none exists. When the agent runs the same command in the same directory again in the same session, you get a prompt. A denial is confirmable when dcg returns a pack ID and the pack is not the guardrails pack. The guardrails pack protects dcg itself, for example against `dcg allowlist add` or a hook toggle, so its denials always keep the `dcg allow-once` flow.

The agent must see the denial first, because the reason of a Claude Code `ask` goes to you and not to the agent. `retried()` in [`core.ts`](core.ts) records each first denial as a hash of the directory and command, in one file per session under `$TMPDIR/block-destructive-commands/`. After the first denial, each later run of the same command asks. If the state cannot be written, the hook keeps the denial.

A confirmation does not register a dcg exception: `dcg allow-once list` does not show it, and dcg does not get a spare code for the same command. The agent transcript records the call.

| Agent       | Prompt on the retry                                                                   | Shown when                                                       |
| ----------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Claude Code | `guard.sh --ask` changes `deny` to `ask`, and Claude Code shows its permission prompt | `permission_mode` is `default`, `acceptEdits`, `plan`, or `auto` |
| pi          | `pi.ts` shows a `ctx.ui.confirm` dialog with the command and the dcg reason           | `ctx.mode` is `tui`                                              |
| Codex, omp  | None                                                                                  | Never                                                            |

In all other cases, the hook denies each run without the hint and returns the `dcg allow-once` code.

In `auto` mode, a hook `ask` shows the prompt to you and the classifier does not answer it (tested on 2026-11-01). Claude Code keeps the denial in `bypassPermissions` and `dontAsk`, because nobody tested these modes. `dontAsk` never prompts, and the reason of an `ask` goes to you and not to the agent, so the agent would not get the `dcg allow-once` code.

pi keeps the denial in RPC mode because an RPC client can be a program that answers dialogs itself. In omp, the denial stays because the omp extension context has no `ctx.mode` field (omp 18.14.1). Codex does not get `--ask`, because nobody tested how Codex handles a hook `ask`.

## pi and omp

`pi.ts` runs `dcg hook` in the session directory and sends a `Bash` tool payload through stdin. This selects the POSIX dialect, uses the live hook approval flow, and returns the denial reason, rule ID, and a real `dcg allow-once <code>` command. `dcg test` is a diagnostic interface: its denial output does not provide an approval code. The adapter preserves the hook's permission reason and adds structured rule and approval details if they are missing from that reason.

In pi, enter `!dcg allow-once <actual-code>` in the conversation to approve one run, then let the agent retry the unchanged command in the original directory. The `!` command is a user shell action, not an agent tool call. A conversational approval or a confirmation dialog alone does not register a dcg exception. No extra terminal or custom approval UI is needed.

omp loads the same `pi.ts`, not the extension that `dcg install --omp` writes. That generated file holds the absolute path of the binary, which is different on the host and in the devcontainer, and it changes with each dcg release. Two consequences:

- `dcg doctor` reports the omp extension as missing.
- A local PTY call in omp (`pty: true`) through a cmd or PowerShell shell is checked as POSIX. The generated extension maps that shell to its own dialect.

## Toggle

Use the standard [`toggle-hook`](../toggle-hook/README.md) controls in Claude Code, pi, and omp:

```text
/toggle-hook block-destructive-commands
/toggle-hook --repo block-destructive-commands
/toggle-hook --global block-destructive-commands
```

The first command changes the session state. The flags change persistent repository or global state. Run the same command again to turn the hook back on at that scope. The hook also participates in `all`, completion, the hook list, and the disabled-hook status display.

All adapters read `AGENT_HOOKS_DISABLE` as hook names separated by spaces or commas. They also read `agent-hook.block-destructive-commands.enabled` through `git config --type=bool --get`. A repository value wins over a global value. A session disable wins over both. An unset or invalid value keeps dcg on.

Claude Code and Codex use the hook process directory for the git config read; pi and omp use the session directory. The check does not follow a `cd` or `git -C` inside the command. In Codex, set the variable before launch or change the git config in your own terminal, because Codex has no `/toggle-hook` command.

**Warning:** Turning this hook off skips all dcg checks, including protection against agent writes to hook toggle keys. It also lets an agent run `git commit --no-verify`, which skips the git guards `block-secret-commits` and `block-commit-attribution`. Prefer `dcg allow-once <code>` for one command. The other guard hooks stay active.

## Configuration

dcg reads `~/.config/dcg/config.toml` and a `.dcg.toml` in the project. This repository tracks the first one as [`dot_config/dcg/config.toml`](../../../dot_config/dcg/config.toml). Its [README](../../../dot_config/dcg/README.md) explains each enabled pack and why some packs stay disabled. Its [Exceptions](../../../dot_config/dcg/README.md#exceptions) section tells you how to allow a blocked command. `dcg explain "<command>"` shows the rule that blocks a command.

## Tests

```
node test/check.ts
```

from this folder, or `just hooks-check`. The check tests `core.ts` with stub dcg results, `io.ts` with stub dcg scripts, `guard.sh` with a stub binary, and `pi.ts` with a stub pi. It checks session, repository, and global toggles, repository precedence, invalid values, and shell payload preservation, blocking exit codes, missing binaries, invalid JSON, and internal timeouts. It also checks which denials are confirmable, the retry state, and in each permission mode the first denial and the `--ask` rewrite on a retry. The last group runs the installed `~/.local/bin/dcg` on `git reset --hard HEAD~1`, on `ls -la`, and through the pi dialog, and is skipped when the binary is missing.

## Files

| File                             | Role                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| [`core.ts`](core.ts)             | Turns the dcg exit code and JSON into a block reason, and records retries.       |
| [`io.ts`](io.ts)                 | Sends a Bash hook payload to `~/.local/bin/dcg`, with a 5 s timeout.             |
| [`guard.sh`](guard.sh)           | Checks toggles and passes the original payload to dcg for Claude Code and Codex. |
| [`pi.ts`](pi.ts)                 | The pi and omp extension.                                                        |
| [`test/check.ts`](test/check.ts) | The self-check.                                                                  |
