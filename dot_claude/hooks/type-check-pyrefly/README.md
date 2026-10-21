# type-check-pyrefly

Runs [pyrefly](https://pyrefly.org/) on the whole project once, when the agent stops, and gives the errors to the model, so that the model fixes them. [`type-check-tsc`](../type-check-tsc/README.md) is the same hook for TypeScript.

One core, [`core.ts`](core.ts), serves four agents through three adapters. An adapter is the file that connects the core to the hook API of one agent.

| Agent                 | Adapter                                                                                                                      | Loaded by                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| pi                    | [`pi.ts`](pi.ts): `agent_end` sends the errors with `sendMessage` and `triggerTurn`, which starts one more run               | `extensions` in `dot_pi/agent/modify_settings.json`                         |
| omp                   | [`omp.ts`](omp.ts): `session_stop` returns `{ continue: true, additionalContext }` with the errors, which runs one more turn | `extensions` in `dot_omp/private_agent/private_config.yml`                  |
| Claude Code and Codex | [`command.ts`](command.ts): exit code 2 with the errors on stderr                                                            | `Stop` in `dot_claude/settings.json.tmpl` and `dot_codex/modify_hooks.json` |

## What it checks

The hook runs once when the agent stops: on `Stop` in Claude Code and Codex, on `agent_end` in pi, and on `session_stop` in omp. A stop carries no file path, so the hook asks git which files changed. It runs `pyrefly check` only when a changed or untracked `.py` file is in the repository, and it then checks the whole project.

The hook skips these cases with no output:

- A folder that is not in a git work tree.
- A repository that sets `agent-hook.type-check-pyrefly.enabled` to `false`.
- No changed Python file. A deleted `.py` file does not count.
- pyrefly that is not on `PATH`.
- pyrefly that exits 1 with `No Python files matched`. Its config then matches no files, which is not a type error.
- pyrefly that runs for more than 60 s.
- In pi and omp, a run that you stopped or that failed.

A git diff also holds work from before the session, so an old type error blocks the stop too. The code marks this with a `shortcut:` comment.

## Requirements

Install pyrefly:

```sh
uv tool install pyrefly
```

The hook also needs `git` on `PATH`. In Claude Code and Codex, `command.ts` needs Node 23.6 or later, which runs `.ts` files without a flag. pi and omp load `pi.ts` and `omp.ts` in their own runtime, so they need no `node` on `PATH`.

Codex runs a hook only after you trust its entry. After a hook entry changes, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## How it works

1. The hook stops when `AGENT_HOOKS_DISABLE` names `type-check-pyrefly`.
2. It finds the repository root with `git rev-parse --show-toplevel`, because the session folder can be a subdirectory.
3. It stops when the repository sets `agent-hook.type-check-pyrefly.enabled` to `false` in git config.
4. It lists the changed paths: `git diff --name-only HEAD` plus the untracked files, without deleted files. Before the first commit, the diff fails, so only the untracked files count.
5. It stops when no path in the list ends in `.py`.
6. It runs `pyrefly check` at the root, on the whole project, because a type checker needs the whole project.
7. When pyrefly exits non-zero, the hook gives the pyrefly output to the model.

The hook stops each program (`git` or pyrefly) after 60 s and counts it as missing.

## What the model sees

The model gets the stdout and stderr of pyrefly, and then this line:

```text
Type check failed. Fix the errors above, then stop.
```

### Each agent

- **Claude Code and Codex:** `command.ts` exits 2 with the errors on stderr, which blocks the stop. The model continues with the errors.
- **pi:** `pi.ts` sends the errors as a follow-up message, and the message starts one more run.
- **omp:** `omp.ts` returns the errors from `session_stop` as context for one more turn.

`command.ts` uses these exit codes:

- `0`: pyrefly passed, or the hook skipped the check. The stop passes.
- `1`: the payload on stdin is not valid JSON. The stop passes.
- `2`: pyrefly found errors. The stop is blocked.

### The loop guard

The loop guard gives the model one try to fix the errors. A check that still fails does not block each stop after it.

- **Claude Code, Codex, and omp:** the agent sets `stop_hook_active` on the stop after a block. The adapter then lets the stop pass.
- **pi:** pi has no `stop_hook_active`, so `pi.ts` keeps a flag. The end of the run that it started passes without a check, and the run after it is checked again.

## What you see

- **pi:** the transcript shows the message with the errors.
- **Claude Code and Codex without Node 23.6:** the `SessionStart` check shows a warning with the list of hooks that are off. See [A missing `node` gives a warning](../README.md#shared-conventions).

A skip shows nothing.

## Settings

- **Turn off for the session:** run [`/toggle-hook`](../toggle-hook/README.md), or set `AGENT_HOOKS_DISABLE` to a list that holds `type-check-pyrefly`. Separate the names with spaces or commas. In Codex, set the variable at launch.
- **Turn off in one repository:** run `/toggle-hook --repo type-check-pyrefly`. In Codex, run `git config agent-hook.type-check-pyrefly.enabled false` in your own terminal. Outside git, or with a value that is not a boolean, the hook stays on. The dcg pack `local.agent_hook` blocks an agent command that writes this key.
- **Turn off for good:** remove the entry from the file in the "Loaded by" column of the agent table.
- **Files to check:** the hook gives no options to `pyrefly check`, so the pyrefly config at the repository root sets which files pyrefly checks.

## Failure behavior

The hook fails open in every agent: a broken check lets the stop pass, so it never keeps the agent working.

| Failure                                     | Result                                                                                   | What you see               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| A bad payload                               | `command.ts` exits 1, which does not block                                               | Nothing                    |
| `command.ts` runs for more than 60 s        | Claude Code and Codex stop it, which does not block                                      | Nothing                    |
| pyrefly is missing or runs past 60 s        | The hook skips the check                                                                 | Nothing                    |
| An error in `pi.ts` or `omp.ts`             | The adapter catches the error and starts no run                                          | Nothing                    |
| No `node` on `PATH` in Claude Code or Codex | The entry starts with `command -v node >/dev/null \|\| exit 0`, so the hook does not run | The `SessionStart` warning |

## Testing

`node test/check.ts` runs `command.ts` in a git repository with a stand-in pyrefly, and checks `pi.ts` and `omp.ts` with stubs. See [`docs/testing.md`](docs/testing.md).

## Design notes

### Shared with type-check-tsc

The docs of [`type-check-tsc`](../type-check-tsc/README.md) give the design that both hooks share: why the hook is not a mod in Claude Code, why it runs at a stop and not after each edit, and the loop guard. A mod is a hook that Claude Code loads in its own process.

The hook follows the [pyrefly agentic-loop advice](https://pyrefly.org/blog/pyrefly-agentic-loop): run `pyrefly check` at the project root on a stop and give the errors to the model. pyrefly ships no hook of its own, see [`hook-alternatives.md`](../../../docs/research/hooks/hook-alternatives.md).

### Why the root

From a subdirectory, the changed-path list covers the whole repository, but pyrefly sees only that subdirectory. So the hook runs pyrefly at the root, where pyrefly sees the same scope as the list.

### Files

| File                          | Deployed to `~/.claude/hooks/type-check-pyrefly/` | Role                                                         |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `core.ts`                     | Yes                                               | Finds a changed Python file and runs pyrefly                 |
| `pi.ts`                       | Yes                                               | The pi extension                                             |
| `omp.ts`                      | Yes                                               | The omp extension, in place of `pi.ts`                       |
| `command.ts`                  | Yes                                               | Claude Code and Codex command hook                           |
| `io.ts`                       | Yes                                               | The `Io` under Node, with the 60 s limit, for the 3 adapters |
| `README.md`, `docs/`, `test/` | No                                                | Kept in the repo by `.chezmoiignore`                         |
