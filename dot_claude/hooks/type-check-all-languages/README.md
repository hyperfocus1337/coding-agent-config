# type-check-all-languages

Type-checks the whole project once, when the agent stops, and gives the errors to the model, so it fixes them.

One core, [`core.ts`](core.ts), serves four agents through two adapters:

| Agent                 | Adapter                                                                                                        | Loaded by                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| pi and omp            | [`pi.ts`](pi.ts): `agent_end` sends the errors with `sendMessage` and `triggerTurn`, which starts one more run | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Claude Code and Codex | [`command.ts`](command.ts): exit code 2 with the errors on stderr                                              | `Stop` in `dot_claude/settings.json.tmpl` and `dot_codex/modify_hooks.json`                        |

## Why not a mod in Claude Code

The design gave Claude Code a mod on `classic.Stop`. In a live test on 2026-10-19 with Claude Code 2.1.303, the mod loaded but did not run. The debug log said `classic.Stop bypassed by cc-plugin-sec-default (tier user)`, with `cc-plugin-sec-default@builtin seated outermost: the organization is team`. For a Team organization, that built-in plugin skips each user mod on a `classic.*` event, but not on `tool.call`, and the settings hook beneath it still runs. So Claude Code runs `command.ts` from `settings.json`, as it does for `block-secret-commits`.

## How it works

A stop carries no file path, so the hook asks git what changed: `git diff --name-only HEAD` plus the untracked files, without deleted files. The hook first finds the repository root, because the session folder can be a subdirectory. From a subdirectory, the changed-path list covers the whole repository, but a checker sees only that subdirectory. The hook picks the checkers by the extensions in that list:

| Extension                  | Checker                         | Also needs      |
| -------------------------- | ------------------------------- | --------------- |
| `.py`                      | [pyrefly](https://pyrefly.org/) |                 |
| `.ts` `.tsx` `.mts` `.cts` | `tsc --noEmit`                  | `tsconfig.json` |

Each checker runs at the root, on the whole project, because a type checker needs the whole project. The changed-path list only decides which checker starts. When both languages changed, both checkers run, so one stop reports every language.

The hook skips these cases with no output:

- A folder that is not in a git work tree.
- A checker that is not on `PATH`.
- `tsc` when the root has no `tsconfig.json`. Without one, `tsc` prints its whole help text and exits 1.
- pyrefly that exits 1 with `No Python files matched`. Its config then matches no files, which is not a type error.
- A checker that runs for more than 60 s. Each checker has its own limit.

A git diff also holds work from before the session, so an old type error in a changed language blocks too. The code marks this with a `shortcut:` comment.

## Why a stop and not each edit

The other file hooks run after each Write or Edit, because they act on the one file that the call changed. A type checker reads the whole project. After each edit, it would check everything again and print the same unrelated errors each time, which fills the context with the same output. At a stop, it runs once and still keeps the agent working until the errors are gone.

`SessionEnd` does not work for this. Its output goes to the terminal as the process stops, so the model never reads it, and the event carries no file path.

## How the model sees the errors

- **Claude Code and Codex:** `command.ts` exits 2 with the errors on stderr, which blocks the stop. The model continues with the errors.
- **pi and omp:** `pi.ts` sends the errors as a message that the model reads, and the message starts one more run. `omp -p` aborts that run when it exits, so in omp the check reaches the model only in an interactive session. `pi -p` runs it.

## The loop guard

A check that the model cannot fix must not block every stop after it. Claude Code and Codex set `stop_hook_active` to `true` in a stop that follows a block, and `command.ts` then lets the stop pass.

pi and omp have no `stop_hook_active`. `pi.ts` keeps a flag instead: after it starts a run, the end of that run passes without a check, and the run after it is checked again. `pi.ts` also starts no run when you stopped the run or the run failed, or when omp says that the run goes on by itself (`willContinue`).

`pi.ts` uses `agent_end`, not pi's `agent_before_settle`: omp 18.10.3 does not have that event, and pi and omp both have `sendMessage` with `triggerTurn`.

## Failure behavior

The hook fails open in every agent, so a broken check never keeps the agent working:

- `command.ts` exits 1 on a bad payload, which does not block. Each agent stops it after 60 s, which does not block either.
- `pi.ts` catches its own errors.

## Dependencies

Python type checking needs [pyrefly](https://pyrefly.org/):

```sh
uv tool install pyrefly
```

`tsc` usually comes from the `typescript` dev dependency of each project. The hook runs `tsc` from `PATH`, and skips it when it is not there.

`pi.ts` and `command.ts` need Node 23.6 or later, which runs `.ts` files without a flag. The Claude Code and Codex entries start with `command -v node || exit 0`, so a machine without Node is not blocked. The `SessionStart` check then gives a warning, see [A missing `node` gives a warning](../README.md#shared-conventions).

Codex runs a hook only after you trust its entry. After the change from `hook.sh` to `command.ts`, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## Tests

`node test/check.ts` runs `command.ts` in a git repository with a stand-in `pyrefly` and `tsc` on `PATH`, which pass, fail, or match no files. It covers each checker, a path that git quotes, the root from a subdirectory, the loop guard, a missing checker, a folder outside git, and a repository with no commit. It also checks the pi adapter with a stub. It needs `git`. `just hooks-check` runs it.

## Files

| File                 | Deployed to `~/.claude/hooks/type-check-all-languages/` | Role                                                                   |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `core.ts`            | Yes                                                     | Finds the changed languages and runs their checkers                    |
| `pi.ts`              | Yes                                                     | pi and omp extension                                                   |
| `command.ts`         | Yes                                                     | Claude Code and Codex command hook                                     |
| `io.ts`              | Yes                                                     | The `Io` under Node, with the 60 s limit, for `pi.ts` and `command.ts` |
| `README.md`, `test/` | No                                                      | Kept in the repo by `.chezmoiignore`                                   |
