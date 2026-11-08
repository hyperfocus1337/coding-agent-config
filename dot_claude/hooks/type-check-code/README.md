# type-check-code

Runs the type checkers on the whole project once, when the agent stops, and gives the errors to the model, so that the model fixes them. Each checker is one module in [`checkers/`](checkers/), listed in `CHECKERS` in [`core.ts`](core.ts):

| Checker   | Module                              | Starts when git reports a changed                                           | Runs at the root |
| --------- | ----------------------------------- | --------------------------------------------------------------------------- | ---------------- |
| `tsc`     | [`tsc.ts`](checkers/tsc.ts)         | `.ts`, `.tsx`, `.mts`, or `.cts` file, and the root holds a `tsconfig.json` | `tsc --noEmit`   |
| `pyrefly` | [`pyrefly.ts`](checkers/pyrefly.ts) | `.py` file                                                                  | `pyrefly check`  |

One core, [`core.ts`](core.ts), serves four agents through three adapters. An adapter is the small file that connects the core to the hook API of one agent.

| Agent                 | Adapter                                                                                                                      | Loaded by                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| pi                    | [`pi.ts`](pi.ts): `agent_before_settle` appends findings and requests one shared correction run                              | `extensions` in `dot_pi/agent/modify_settings.json`                                 |
| omp                   | [`omp.ts`](omp.ts): `session_stop` returns `{ continue: true, additionalContext }` with the errors, which runs one more turn | `extensions` in `dot_omp/private_agent/private_config.yml`                          |
| Claude Code and Codex | [`command.ts`](command.ts): exit code 2 with the errors on stderr                                                            | `Stop` in `dot_claude/private_settings.json.tmpl` and `dot_codex/modify_hooks.json` |

## What it checks

The hook runs once each time the agent stops:

- **Claude Code and Codex:** on the `Stop` event, as a command hook. A command hook is a program that the agent starts, with the event as JSON on stdin. Claude Code does not run this hook as a mod, see [Why not a mod in Claude Code](#why-not-a-mod-in-claude-code).
- **Pi:** on `agent_before_settle`, after retries and queued work, before final settlement.
- **omp:** on `session_stop`, when the main agent is about to stop.

A stop carries no file path, so the hook asks git which files changed. A checker starts only when git reports a changed or untracked file with one of its extensions. A deleted file does not count. The checker then checks the whole project, not only the changed files, because a type checker needs the whole project.

When both a TypeScript and a Python file changed, `tsc` and `pyrefly` run in parallel, so the hook takes as long as the slower one. The git diff also holds work from before the session, so an old type error blocks too. The code marks this limit with a `shortcut:` comment.

## Requirements

- **`tsc`:** it usually comes from the `typescript` dev dependency of each project. The hook runs `tsc` from `PATH`, and skips it when `tsc` is not there.
- **`pyrefly`:** install it with `uv tool install pyrefly`. The hook skips it when `pyrefly` is not on `PATH`. See [Python environment](#python-environment).
- **`git`:** the hook asks git which files changed.
- **Node 23.6 or later:** `command.ts` needs it, because it runs `.ts` files without a flag. The Claude Code and Codex entries start with `command -v node || exit 0`, so a machine without Node is not blocked. pi and omp load `pi.ts` and `omp.ts` in their own runtime.
- **Codex trust:** Codex runs a hook only after you trust its entry. After a hook entry changes, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

### Python environment

`uv tool install pyrefly` installs the checker, not the dependencies of the application into the Python interpreter that pyrefly queries. Use the dependency setup of the project to install its declared dependencies in that environment. Prefer the environment of the project when the repository defines one, rather than a shared interpreter.

Verify that the pyrefly configuration defines the correct import roots, including any nested application folder, and that pyrefly uses the intended interpreter. The hook does not infer import roots from changed files, install dependencies, or create `pyrefly.toml`. Missing-import errors still block the stop.

## How it works

1. The adapter applies the [loop guard](#the-loop-guard). In pi and omp, the adapter also does nothing when you stopped the run or the run failed.
2. The core does nothing when `AGENT_HOOKS_DISABLE` names `type-check-code`.
3. `git rev-parse --show-toplevel` finds the repository root. The session folder can be a subdirectory.
4. The core does nothing when the repository sets `agent-hook.type-check-code.enabled` to `false` in git config.
5. `git diff --name-only HEAD` plus the untracked files, without deleted files, gives the changed-file list. Before the first commit, only the untracked files count.
6. For each checker, in parallel: if the list holds a file of the checker and no toggle turns the checker off, its command runs at the root. The changed-file list covers the whole repository, and from a subdirectory, a checker would see only that subdirectory.
7. The output of each checker that exits with a code other than 0 goes to the model, `tsc` first.

### Skips

The hook, or one checker, skips these cases with no output:

- A folder that is not in a git work tree.
- A hook or checker that a [setting](#settings) turns off.
- No changed file of the checker.
- A checker that is not on `PATH`.
- A root with no `tsconfig.json`, for `tsc`. Without one, `tsc` prints its whole help text and exits 1.
- `pyrefly` that exits 1 with `No Python files matched`. Its config then matches no files, which is not a type error.
- A checker or a `git` call that runs for more than 50 s.

### The loop guard

A check that the model cannot fix must not block every stop after it. Claude Code and Codex set `stop_hook_active` to `true` in a stop that follows a block, and `command.ts` then lets the stop pass.

Pi has no `stop_hook_active`. Each `pi.ts` handler checks once per activity, even when its check passes. It appends findings to the existing boundary entries and requests a continuation. The lint and type-check findings therefore reach one correction run together.

Further boundaries skip checking until `agent_settled` resets the flag. Aborted or failed activities start no correction run.

omp sets `stop_hook_active` on the stop after a `session_stop` continuation, and `omp.ts` then lets the stop pass. omp also allows at most 8 continuations. `omp.ts` starts no turn when you stopped the run or the run failed.

One automatic correction does not guarantee a pass. The model must rerun the relevant checks during the correction and report the remaining failures.

## What the model sees

For each checker that failed, the model gets its output (stdout, then stderr) and then the advice line of the checker. After `tsc`:

```text
Type check failed. Fix the errors above, rerun the relevant checks, then stop. Report any remaining failures.
```

After `pyrefly`:

```text
Type check failed. For missing imports, first verify the project configuration, import roots, and Python environment used by Pyrefly before changing imports. Use the project's existing dependency and environment setup. Do not suppress diagnostics or weaken checking to obtain a pass. Fix the cause, rerun the check, then stop. Report any remaining failures.
```

`command.ts` uses these exit codes:

- **0:** no errors, a skip, or a stop that the loop guard lets pass. The hook prints nothing.
- **1:** a bad payload. The stop is not blocked.
- **2:** a checker found errors. The stop is blocked.

## What you see

- **pi:** the message with the errors shows in the transcript.
- **Claude Code and Codex:** when `node` cannot run `.ts` files, the `SessionStart` check gives a warning once for each session. See [A missing `node` gives a warning](../README.md#shared-conventions).

## Settings

The hook has no config file. The 50 s limit for each program is fixed in [`io.ts`](io.ts), below the 60 s `timeout` of the Claude Code and Codex entries.

| Scope          | The whole hook                             | One checker                                                                        |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Until you quit | `/toggle-hook type-check-code`             | `/toggle-hook type-check-code.tsc` or `type-check-code.pyrefly`                    |
| One repository | `/toggle-hook --repo type-check-code`      | `/toggle-hook --repo type-check-code.tsc`                                          |
| Git config key | `agent-hook.type-check-code.enabled false` | `agent-hook.type-check-code.tsc false`, `agent-hook.type-check-code.pyrefly false` |

[`/toggle-hook`](../toggle-hook/README.md) changes `AGENT_HOOKS_DISABLE` in the running agent of Claude Code, pi, and omp. In Codex, set the variable at launch, or run the `git config` command in your own terminal. Outside git, or with a value that is not a boolean, the hook and each checker stay on. The dcg pack `local.agent_hook` blocks an agent command that writes these keys.

To turn the hook off for good, remove its entry from the file in the "Loaded by" column of the agent table. The pyrefly configuration at the repository root sets which files pyrefly checks, and the `tsconfig.json` sets the files of `tsc`.

## Failure behavior

The hook fails open in every agent: a failure lets the stop pass, so a broken check never keeps the agent working.

- **Bad payload:** `command.ts` exits 1, which does not block.
- **Slow checker:** `io.ts` stops a checker after 50 s, and the hook skips that checker with no output. The other checker still reports.
- **Slow hook:** each agent stops `command.ts` after 60 s, which does not block either.
- **Missing checker or `node`:** the hook skips that checker, or the whole check, with no output.
- **Error in `pi.ts` or `omp.ts`:** each adapter catches its own errors and starts no run.

## Testing

`node test/check.ts` runs `command.ts` in a git repository with a stand-in `tsc` and `pyrefly` on `PATH`, and checks `pi.ts` and `omp.ts` with stubs. See [`docs/testing.md`](docs/testing.md).

## Design notes

### Why not a mod in Claude Code

The design gave Claude Code a mod on `classic.Stop`. In a live test on 2026-10-19 with Claude Code 2.1.303, the mod loaded but did not run. The debug log said `classic.Stop bypassed by cc-plugin-sec-default (tier user)`, with `cc-plugin-sec-default@builtin seated outermost: the organization is team`.

For a Team organization, that built-in plugin skips each user mod on a `classic.*` event, but not on `tool.call`. The settings hook beneath it still runs. So Claude Code runs `command.ts` from `settings.json`.

### Why a stop and not each edit

Formatters and lint-prose run after edits. Lint-code and the type checkers run at stop time, so unfinished code does not produce repeated errors after each edit. Type checkers read the whole project, while lint-code checks changed supported files.

At a stop, the hook runs once and gives the model one correction opportunity. `SessionEnd` does not work for this. Its output goes to the terminal as the process stops, so the model never reads it, and the event carries no file path.

### Why omp.ts in omp

omp does not await `agent_end`. So the message of `pi.ts` was lost when omp settled first: in `omp -p` 18.12.2, also with a check of 217 ms. omp awaits `session_stop`, so `omp.ts` keeps the run, also in `omp -p`. Pi now uses `agent_before_settle` rather than the old `agent_end` adapter.

### pyrefly

The pyrefly checker follows the [pyrefly agentic-loop advice](https://pyrefly.org/blog/pyrefly-agentic-loop): run `pyrefly check` at the project root on a stop and give the errors to the model. pyrefly ships no hook of its own, see [`hook-alternatives.md`](../../../docs/research/hooks/hook-alternatives.md).

### Files

| File                          | Deployed to `~/.claude/hooks/type-check-code/` | Role                                                             |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `core.ts`                     | Yes                                            | Finds the changed files and runs each checker that they start    |
| `checkers/`                   | Yes                                            | One module for each checker: its extensions, command, and advice |
| `pi.ts`                       | Yes                                            | The pi extension                                                 |
| `omp.ts`                      | Yes                                            | The omp extension, in place of `pi.ts`                           |
| `command.ts`                  | Yes                                            | Claude Code and Codex command hook                               |
| `io.ts`                       | Yes                                            | The `Io` under Node, with the 50 s limit, for the 3 adapters     |
| `README.md`, `docs/`, `test/` | No                                             | Kept in the repo by `.chezmoiignore`                             |
