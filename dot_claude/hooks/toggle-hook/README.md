# toggle-hook

Adds the `/toggle-hook` command, which turns an advisory hook off or on until you quit the agent. Use it when a formatter fights the style of a repo, or when a linter reports on a file that you do not own, and you do not want to restart the agent.

| Agent       | Adapter                                                                                                       | Loaded by                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `$.command.register` and a `command.run` hook                | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `registerCommand`, with completion of the hook names                                        | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | None. Codex has no extension commands, so set the variable at launch: `CLAUDE_HOOKS_DISABLE=lint-prose codex` | Not applicable                                                                                     |

## What it checks

The hook checks nothing. It runs when you type `/toggle-hook`, and the argument selects the result:

| Argument       | Result                                                                        |
| -------------- | ----------------------------------------------------------------------------- |
| None           | Lists the state of each hook                                                  |
| A hook name    | Flips that hook, and prints its new state                                     |
| `all`          | Turns all 7 hooks off, or turns all of them on again when one or more are off |
| A guard name   | Changes nothing, and names the escape hatch of that guard                     |
| Any other text | Changes nothing, and lists the hook names                                     |

### Which hooks have a toggle

Only the advisory hooks have a toggle. An advisory hook formats, lints, or type-checks, and does not exist to stop the model. The 7 advisory hooks are in `HOOKS` in [`core.ts`](core.ts):

- `format-prettier`, `format-org-tables`, and `format-code`
- `lint-code` and `lint-prose`
- `type-check-tsc` and `type-check-pyrefly`

The guards (`enforce-cli-tools`, `block-commit-attribution`, `block-secret-commits`) exist to stop the model, so they keep their own escape hatches and have no toggle. `track-session-changes` only writes a log. `format-staged-files`, the git `pre-commit` hook, removes the variable before it runs the formatters, so a commit is formatted also while a formatter is off.

## Requirements

- **Claude Code:** the mod needs Claude Code 2.1.296 or later, the oldest version tested.
- **pi and omp:** `pi.ts` runs in the runtime of the agent and needs no `node` on `PATH`.

## How it works

The state is one environment variable, `CLAUDE_HOOKS_DISABLE`: a list of hook names, separated by spaces or commas. The command changes the variable in the process of the agent itself. Nothing goes to disk, so the change does not reach another session, and chezmoi sees no drift.

Each of the 7 hooks reads the variable on each run, and does nothing when the variable names it. In Claude Code, `type-check-tsc` and `type-check-pyrefly` are command hooks, which Claude Code starts as a new process: each one gets the variable as Claude Code has it when Claude Code starts the hook.

`/clear` in Claude Code and `/new` in pi keep the process, so they also keep the toggle. Quit the agent to turn all hooks on again.

## What the model sees

The model sees no output from this hook, because the model cannot run the command. Only you can. Tests on 2026-10-19 with Claude Code 2.1.303, pi 1.3.0, and omp 18.12.2 showed this:

- In Claude Code, the Skill tool refuses the command as a built-in CLI command.
- pi and omp give the model no tool that runs a command.
- The omp `eval` tool can change `process.env` in its own context, but the extensions do not see that change.

A Bash call cannot change the environment of the agent. The model can read the variable, and can set it for one command, but a hook that the agent runs does not see that value.

## What you see

The command prints the state of the hooks, or the new state of one hook:

```
> /toggle-hook
on   format-prettier
on   format-org-tables
on   format-code
on   lint-code
off  lint-prose
on   type-check-tsc
on   type-check-pyrefly

> /toggle-hook format-prettier
format-prettier is off until you quit the agent.
```

While a hook is off, the status line shows `hooks off: <names>`.

## Settings

You can set `CLAUDE_HOOKS_DISABLE` before you start an agent. This command starts Claude Code with `lint-prose` off, and the status line shows it:

```sh
CLAUDE_HOOKS_DISABLE=lint-prose claude
```

In Codex, this is the only way to turn a hook off.

## Failure behavior

- **The mod throws:** Claude Code skips a hook that throws, so the command does nothing.
- **The engine refuses the write:** for example because of an organization policy. The command prints `Not changed:` and the reason.
- **pi and omp:** `pi.ts` does no I/O that can fail.

## Testing

`node test/check.ts` checks the core and both adapters, see [`docs/testing.md`](docs/testing.md).

## Design notes

The mod changes the variable with `$.env.set`, and `pi.ts` changes `process.env`. The other mods read it with `$.env.get`, and the other extensions and `command.ts` read it through `io.ts`.

| File                                    | Deployed to `~/.claude/hooks/toggle-hook/` | Role                                                      |
| --------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `core.ts`                               | Yes                                        | The hook list, the command logic, the status text. No I/O |
| `hooks/register.ts`, `hooks/hooks.json` | Yes                                        | Claude Code mod                                           |
| `dot_claude-plugin/plugin.json`         | Yes, as `.claude-plugin/plugin.json`       | Plugin manifest                                           |
| `pi.ts`                                 | Yes                                        | pi and omp extension                                      |
| `README.md`, `docs/`, `test/`           | No                                         | Kept in the repo by `.chezmoiignore`                      |
