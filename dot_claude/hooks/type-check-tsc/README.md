# type-check-tsc

Runs `tsc --noEmit` on the whole project once, when the agent stops, and gives the errors to the model, so that the model fixes them. [`type-check-pyrefly`](../type-check-pyrefly/README.md) is the same hook for Python, and this README holds the design notes that both hooks share.

One core, [`core.ts`](core.ts), serves four agents through three adapters. An adapter is the small file that connects the core to the hook API of one agent.

| Agent                 | Adapter                                                                                                                      | Loaded by                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| pi                    | [`pi.ts`](pi.ts): `agent_end` sends the errors with `sendMessage` and `triggerTurn`, which starts one more run               | `extensions` in `dot_pi/agent/modify_settings.json`                         |
| omp                   | [`omp.ts`](omp.ts): `session_stop` returns `{ continue: true, additionalContext }` with the errors, which runs one more turn | `extensions` in `dot_omp/private_agent/private_config.yml`                  |
| Claude Code and Codex | [`command.ts`](command.ts): exit code 2 with the errors on stderr                                                            | `Stop` in `dot_claude/settings.json.tmpl` and `dot_codex/modify_hooks.json` |

## What it checks

The hook runs once each time the agent stops:

- **Claude Code and Codex:** on the `Stop` event, as a command hook. A command hook is a program that the agent starts, with the event as JSON on stdin. Claude Code does not run this hook as a mod, see [Why not a mod in Claude Code](#why-not-a-mod-in-claude-code).
- **pi:** on `agent_end`, at the end of each run.
- **omp:** on `session_stop`, when the main agent is about to stop.

A stop carries no file path, so the hook asks git which files changed. `tsc` starts only when both of these are true:

- git reports a changed or untracked `.ts`, `.tsx`, `.mts`, or `.cts` file. A deleted file does not count.
- The repository root holds a `tsconfig.json`.

`tsc` then checks the whole project, not only the changed files, because a type checker needs the whole project. The git diff also holds work from before the session, so an old type error blocks too. The code marks this limit with a `shortcut:` comment.

## Requirements

- **`tsc`:** it usually comes from the `typescript` dev dependency of each project. The hook runs `tsc` from `PATH`, and skips the check when `tsc` is not there.
- **`git`:** the hook asks git which files changed.
- **Node 23.6 or later:** `pi.ts`, `omp.ts`, and `command.ts` need it, because it runs `.ts` files without a flag. The Claude Code and Codex entries start with `command -v node || exit 0`, so a machine without Node is not blocked.
- **Codex trust:** Codex runs a hook only after you trust its entry. After a hook entry changes, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## How it works

1. The adapter applies the [loop guard](#the-loop-guard). In pi and omp, the adapter also does nothing when you stopped the run or the run failed.
2. The core does nothing when `CLAUDE_HOOKS_DISABLE` names `type-check-tsc`.
3. `git rev-parse --show-toplevel` finds the repository root. The session folder can be a subdirectory.
4. `git diff --name-only HEAD` plus the untracked files, without deleted files, gives the changed-file list. Before the first commit, only the untracked files count.
5. If the list holds a TypeScript file and the root holds a `tsconfig.json`, `tsc --noEmit` runs at the root. The changed-file list covers the whole repository, and from a subdirectory, `tsc` would see only that subdirectory.
6. If `tsc` exits with a code other than 0, the adapter gives its output to the model.

### Skips

The hook skips these cases with no output:

- A folder that is not in a git work tree.
- No changed TypeScript file.
- `tsc` that is not on `PATH`.
- A root with no `tsconfig.json`. Without one, `tsc` prints its whole help text and exits 1.
- `tsc` that runs for more than 60 s.

### The loop guard

A check that the model cannot fix must not block every stop after it. Claude Code and Codex set `stop_hook_active` to `true` in a stop that follows a block, and `command.ts` then lets the stop pass.

pi has no `stop_hook_active`. `pi.ts` keeps a flag instead: after it starts a run, the end of that run passes without a check, and the run after it is checked again. `pi.ts` also starts no run when you stopped the run or the run failed.

omp sets `stop_hook_active` on the stop after a `session_stop` continuation, and `omp.ts` then lets the stop pass. omp also allows at most 8 continuations. `omp.ts` starts no turn when you stopped the run or the run failed.

## What the model sees

The model gets the output of `tsc` (stdout, then stderr), and then this line:

```text
Type check failed. Fix the errors above, then stop.
```

- **Claude Code and Codex:** `command.ts` exits 2 with the errors on stderr, which blocks the stop. The model continues with the errors. When `type-check-pyrefly` also blocks the same stop, the model gets both outputs.
- **pi:** `pi.ts` sends the errors as a message that the model reads, and the message starts one more run. `pi -p` also runs it.
- **omp:** `omp.ts` returns the errors from `session_stop` as context for one more turn, which omp runs before it settles. This also works in `omp -p`, see [Why omp.ts in omp](#why-ompts-in-omp).

`command.ts` uses these exit codes:

- **0:** no errors, a skip, or a stop that the loop guard lets pass. The hook prints nothing.
- **1:** a bad payload. The stop is not blocked.
- **2:** `tsc` found errors. The stop is blocked.

## What you see

- **pi:** the message with the errors shows in the transcript.
- **Claude Code and Codex:** when `node` cannot run `.ts` files, the `SessionStart` check gives a warning once for each session. See [A missing `node` gives a warning](../README.md#shared-conventions).

## Settings

The hook has no config file. The 60 s limit for `tsc` is fixed in [`io.ts`](io.ts).

To turn the hook off until you quit the agent, put `type-check-tsc` in `CLAUDE_HOOKS_DISABLE`. In Claude Code, pi, and omp, [`/toggle-hook`](../toggle-hook/README.md) changes the variable in the running agent. In Codex, set the variable at launch.

To turn the hook off for good, remove its entry:

- **Claude Code:** the `type-check-tsc` entry under `Stop` in `dot_claude/settings.json.tmpl`.
- **Codex:** the `type-check-tsc` entry under `Stop` in `dot_codex/modify_hooks.json`.
- **pi:** the `type-check-tsc/pi.ts` line in `extensions` in `dot_pi/agent/modify_settings.json`.
- **omp:** the `type-check-tsc/omp.ts` line in `extensions` in `dot_omp/private_agent/private_config.yml`.

## Failure behavior

The hook fails open in every agent: a failure lets the stop pass, so a broken check never keeps the agent working.

- **Bad payload:** `command.ts` exits 1, which does not block.
- **Slow hook:** each agent stops `command.ts` after 60 s, which does not block either.
- **Slow `tsc`:** `io.ts` stops `tsc` after 60 s, and the hook skips the check with no output.
- **Missing `tsc` or `node`:** the hook skips the check with no output.
- **Error in `pi.ts` or `omp.ts`:** each adapter catches its own errors and starts no run.

## Testing

`node test/check.ts` runs `command.ts` in a git repository with a stand-in `tsc` on `PATH`, and checks `pi.ts` and `omp.ts` with stubs. See [`docs/testing.md`](docs/testing.md).

## Design notes

### Why not a mod in Claude Code

The design gave Claude Code a mod on `classic.Stop`. In a live test on 2026-10-19 with Claude Code 2.1.303, the mod loaded but did not run. The debug log said `classic.Stop bypassed by cc-plugin-sec-default (tier user)`, with `cc-plugin-sec-default@builtin seated outermost: the organization is team`.

For a Team organization, that built-in plugin skips each user mod on a `classic.*` event, but not on `tool.call`. The settings hook beneath it still runs. So Claude Code runs `command.ts` from `settings.json`, as it does for `block-secret-commits`.

### Why a stop and not each edit

The other file hooks run after each Write or Edit, because they act on the one file that the call changed. A type checker reads the whole project. After each edit, it would check everything again and print the same unrelated errors each time, which fills the context with the same output.

At a stop, the hook runs once and still keeps the agent working until the errors are gone. `SessionEnd` does not work for this. Its output goes to the terminal as the process stops, so the model never reads it, and the event carries no file path.

### Why omp.ts in omp

omp does not await `agent_end`. So the message of `pi.ts` was lost when omp settled first: in `omp -p` 18.12.2, also with a check of 217 ms. omp awaits `session_stop`, so `omp.ts` keeps the run, also in `omp -p`.

### Files

| File                          | Deployed to `~/.claude/hooks/type-check-tsc/` | Role                                                         |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `core.ts`                     | Yes                                           | Finds a changed TypeScript file and runs `tsc`               |
| `pi.ts`                       | Yes                                           | The pi extension                                             |
| `omp.ts`                      | Yes                                           | The omp extension, in place of `pi.ts`                       |
| `command.ts`                  | Yes                                           | Claude Code and Codex command hook                           |
| `io.ts`                       | Yes                                           | The `Io` under Node, with the 60 s limit, for the 3 adapters |
| `README.md`, `docs/`, `test/` | No                                            | Kept in the repo by `.chezmoiignore`                         |
