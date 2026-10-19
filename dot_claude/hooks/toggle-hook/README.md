# toggle-hook

Adds the `/toggle-hook` command, which turns an advisory hook off or on until you quit the agent. Use it when a formatter fights the style of a repo, or when a linter reports on a file that you do not own, and you do not want to restart the agent.

```
> /toggle-hook
on   format-prettier
on   format-org-tables
on   format-terraform
on   lint-code
off  lint-prose
on   type-check-tsc
on   type-check-pyrefly

> /toggle-hook format-prettier
format-prettier is off until you quit the agent.
```

| Argument       | Result                                                                        |
| -------------- | ----------------------------------------------------------------------------- |
| None           | Lists the state of each hook                                                  |
| A hook name    | Flips that hook, and prints its new state                                     |
| `all`          | Turns all 7 hooks off, or turns all of them on again when one or more are off |
| A guard name   | Changes nothing, and names the escape hatch of that guard                     |
| Any other text | Changes nothing, and lists the hook names                                     |

While a hook is off, the status line shows `hooks off: <names>`.

| Agent       | Adapter                                                                                                       | Loaded by                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `$.command.register` and a `command.run` hook                | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `registerCommand`, with completion of the hook names                                        | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | None. Codex has no extension commands, so set the variable at launch: `CLAUDE_HOOKS_DISABLE=lint-prose codex` | Not applicable                                                                                     |

## How it works

The state is one environment variable, `CLAUDE_HOOKS_DISABLE`: a list of hook names, separated by spaces or commas. The command changes it in the process of the agent itself, with `$.env.set` in Claude Code and `process.env` in pi and omp. Nothing goes to disk, so the change does not reach another session, and chezmoi sees no drift.

Each of the 7 hooks in `HOOKS` in [`core.ts`](core.ts) reads the variable on each run, and does nothing when the variable names it. The mods read it with `$.env.get`, and the extensions and `command.ts` read it through `io.ts`. In Claude Code, `type-check-tsc` and `type-check-pyrefly` are command hooks: each one gets the variable as Claude Code has it when Claude Code starts the hook. `/clear` in Claude Code and `/new` in pi keep the process, so they also keep the toggle.

You can also set the variable before you start an agent. `CLAUDE_HOOKS_DISABLE=lint-prose claude` starts with `lint-prose` off, and the status line shows it.

## Which hooks have a toggle

Only the advisory hooks: the formatters, the linters, and the type checkers. The guards (`enforce-cli-tools`, `block-commit-attribution`, `block-secret-commits`) exist to stop the model, so they keep their own escape hatches and have no toggle. `track-session-changes` only writes a log. `format-staged-files`, the git `pre-commit` hook, removes the variable before it runs the formatters, so a commit is formatted also while a formatter is off.

## Who can run it

Only you. Tests on 2026-10-19 showed that the model in Claude Code 2.1.303, pi 1.3.0, and omp 18.12.2 cannot run the command:

- In Claude Code, the Skill tool refuses it as a built-in CLI command.
- pi and omp give the model no tool that runs a command.
- The omp `eval` tool can change `process.env` in its own context, but the extensions do not see that change.

A Bash call cannot change the environment of the agent. The model can read the variable, and can set it for one command, but a hook that the agent runs does not see that value.

## Failure behavior

In Claude Code, a hook that throws is skipped, so the command does nothing. When the engine refuses the write, for example because of an organization policy, the command prints `Not changed:` and the reason. `pi.ts` does no I/O that can fail.

## Dependencies

The mod needs Claude Code 2.1.296 or later, the oldest version tested. `pi.ts` needs Node 23.6 or later, which runs `.ts` files without a flag.

## Tests

`node test/check.ts`, from the hook folder, checks the core and both adapters: the mod with a stub `on` and `$`, and `pi.ts` with a stub `pi`. The test of each of the 7 hooks has a case that sets `CLAUDE_HOOKS_DISABLE` and checks that the hook does nothing. The test of `format-staged-files` checks that a commit is still formatted. `just hooks-check` runs all of them.

## Files

| File                                    | Deployed to `~/.claude/hooks/toggle-hook/` | Role                                                      |
| --------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `core.ts`                               | Yes                                        | The hook list, the command logic, the status text. No I/O |
| `hooks/register.ts`, `hooks/hooks.json` | Yes                                        | Claude Code mod                                           |
| `dot_claude-plugin/plugin.json`         | Yes, as `.claude-plugin/plugin.json`       | Plugin manifest                                           |
| `pi.ts`                                 | Yes                                        | pi and omp extension                                      |
| `README.md`, `test/`                    | No                                         | Kept in the repo by `.chezmoiignore`                      |
