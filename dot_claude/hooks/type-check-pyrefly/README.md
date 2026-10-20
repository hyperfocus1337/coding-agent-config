# type-check-pyrefly

Runs [pyrefly](https://pyrefly.org/) on the whole project once, when the agent stops, and gives the errors to the model, so it fixes them. [`type-check-tsc`](../type-check-tsc/README.md) is the same hook for TypeScript, and its README holds the design notes that both hooks share: why not a mod in Claude Code, why a stop and not each edit, and the loop guard.

The hook follows the [pyrefly agentic-loop advice](https://pyrefly.org/blog/pyrefly-agentic-loop): run `pyrefly check` at the project root on a stop and give the errors to the model. pyrefly ships no hook of its own, see [`hook-alternatives.md`](../../../docs/research/hooks/hook-alternatives.md).

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent                 | Adapter                                                                                                                      | Loaded by                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| pi                    | [`pi.ts`](pi.ts): `agent_end` sends the errors with `sendMessage` and `triggerTurn`, which starts one more run               | `extensions` in `dot_pi/agent/modify_settings.json`                         |
| omp                   | [`omp.ts`](omp.ts): `session_stop` returns `{ continue: true, additionalContext }` with the errors, which runs one more turn | `extensions` in `dot_omp/private_agent/private_config.yml`                  |
| Claude Code and Codex | [`command.ts`](command.ts): exit code 2 with the errors on stderr                                                            | `Stop` in `dot_claude/settings.json.tmpl` and `dot_codex/modify_hooks.json` |

## How it works

A stop carries no file path, so the hook asks git what changed: `git diff --name-only HEAD` plus the untracked files, without deleted files. The hook first finds the repository root, because the session folder can be a subdirectory. From a subdirectory, the changed-path list covers the whole repository, but pyrefly sees only that subdirectory. pyrefly starts only when the list holds a `.py` file. It then runs at the root, on the whole project, because a type checker needs the whole project.

The hook skips these cases with no output:

- A folder that is not in a git work tree.
- No changed Python file.
- pyrefly that is not on `PATH`.
- pyrefly that exits 1 with `No Python files matched`. Its config then matches no files, which is not a type error.
- pyrefly that runs for more than 60 s.

A git diff also holds work from before the session, so an old type error blocks too. The code marks this with a `shortcut:` comment.

## Failure behavior

The hook fails open in every agent, so a broken check never keeps the agent working:

- `command.ts` exits 1 on a bad payload, which does not block. Each agent stops it after 60 s, which does not block either.
- `pi.ts` and `omp.ts` catch their own errors.

## Dependencies

```sh
uv tool install pyrefly
```

`pi.ts`, `omp.ts`, and `command.ts` need Node 23.6 or later, which runs `.ts` files without a flag. The Claude Code and Codex entries start with `command -v node || exit 0`, so a machine without Node is not blocked. The `SessionStart` check then gives a warning, see [A missing `node` gives a warning](../README.md#shared-conventions).

Codex runs a hook only after you trust its entry. After a hook entry changes, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## Tests

`node test/check.ts` runs `command.ts` in a git repository with a stand-in `pyrefly` on `PATH`, which passes, fails, or matches no files. It covers a changed, untracked, and deleted `.py` file, a path that git quotes, the root from a subdirectory, the loop guard, a missing pyrefly, a folder outside git, and a repository with no commit. It also checks `pi.ts` and `omp.ts` with stubs. It needs `git`. `just hooks-check` runs it.

## Files

| File                 | Deployed to `~/.claude/hooks/type-check-pyrefly/` | Role                                                         |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `core.ts`            | Yes                                               | Finds a changed Python file and runs pyrefly                 |
| `pi.ts`              | Yes                                               | The pi extension                                             |
| `omp.ts`             | Yes                                               | The omp extension, in place of `pi.ts`                       |
| `command.ts`         | Yes                                               | Claude Code and Codex command hook                           |
| `io.ts`              | Yes                                               | The `Io` under Node, with the 60 s limit, for the 3 adapters |
| `README.md`, `test/` | No                                                | Kept in the repo by `.chezmoiignore`                         |
