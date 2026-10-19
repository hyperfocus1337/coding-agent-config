# Write a hook

The rules for a hook folder in [`dot_claude/hooks/`](../../dot_claude/hooks/README.md), and the steps to add a hook. [`platforms.md`](platforms.md) gives the API facts behind these rules, and [`decisions.md`](decisions.md) gives the reasons.

## Files

Each hook is one folder in `dot_claude/hooks/<hook>/` and imports nothing from outside it. chezmoi deploys it to `~/.claude/hooks/<hook>/`.

| File                            | Role                                                                                                                  | Deployed                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `core.ts`                       | The logic. No Node imports, no `$`, no environment reads.                                                             | Yes                                  |
| `io.ts`                         | The Node side of the core inputs: file reads, `spawn`, `process.env`. For `pi.ts` and `command.ts`.                   | Yes                                  |
| `hooks/register.ts`             | The Claude Code mod                                                                                                   | Yes                                  |
| `hooks/hooks.json`              | `{"modules": ["./register.ts"]}`                                                                                      | Yes                                  |
| `dot_claude-plugin/plugin.json` | The plugin manifest: `name`, `version`, `description`                                                                 | Yes, as `.claude-plugin/plugin.json` |
| `pi.ts`                         | The pi and omp extension                                                                                              | Yes                                  |
| `command.ts`                    | The command hook: stdin JSON in, exit code 2 and stderr out. For Codex, and for Claude Code where a mod does not fit. | Yes                                  |
| Data files                      | `rules`, `config/`, `conf/`: read at run time, never imported                                                         | Yes                                  |
| `README.md`, `docs/`, `test/`   | Kept in the repo by `.chezmoiignore`                                                                                  | No                                   |

A hook that has no Claude Code mod, such as `block-secret-commits`, has no `hooks/` folder and no `dot_claude-plugin/`.

## The core

The core takes values or an `Io` object. It never takes `$` and never reads an environment variable.

- **A pure core** matches text and returns a result. `enforce-cli-tools` and `block-commit-attribution` are pure.
- **An `Io` core** must run a program or read a file before it can decide. It gets an `Io` object with only the functions it needs, for example `stat`, `read`, and `run`. `lint-all-languages/core.ts` is the model.
- **Each `Io` function returns `undefined` for "missing"** (a file that does not exist, a program that is not installed) instead of throwing. The core then applies the "self-disable when a tool is missing" convention in one place.
- **All `Io` functions are async,** because the mod has no synchronous I/O. The Node side wraps `node:fs/promises` and `spawn`.

## The adapters

| Adapter             | Reads the environment with     | Project root                                     | Blocks with               | Feedback after a call                        |
| ------------------- | ------------------------------ | ------------------------------------------------ | ------------------------- | -------------------------------------------- |
| `hooks/register.ts` | `$.env.get("NAME")`, a literal | `$.session.root()`                               | `{ deny }` before `next`  | `{ ...ran, context: [...] }` after `next`    |
| `pi.ts`             | `process.env` through `io.ts`  | `ctx.cwd`                                        | `{ block: true, reason }` | `tool_result` returns `{ content, isError }` |
| `command.ts`        | `process.env` through `io.ts`  | `CLAUDE_PROJECT_DIR \|\| payload.cwd \|\| cwd()` | Exit 2, message on stderr | Exit 2, output on stderr                     |

- **The `$` call-site rule.** In `register.ts`, spell each `$` call where it is used. To give the core an `Io`, write an object literal whose methods spell `$.fs.stat(...)` and `$.process.run(...)` inside them. `claude plugin validate` refuses `$.fs` passed as a value.
- **Empty means unset.** Use `||`, not `??`, for an environment fallback. Bash `${VAR:-default}` also falls back on an empty value.
- **Timeouts.** `$.process.run` stops a program after 30 s. Pass `timeoutMs` where the hook needs more or less.
- **No `classic.*` events.** For a Team organization, Claude Code skips a user mod on a `classic.*` event. Use a command hook in `settings.json.tmpl` for such an event.
- **pi and omp tool results differ.** For example, a pi edit names its file in `path` and an omp edit in `paths`. Read both.

## Failure behavior

Keep the choice that the hook README gives. The adapters differ in what an error that escapes the hook does:

| Adapter      | An error that escapes the hook                | To fail open         | To fail closed                         |
| ------------ | --------------------------------------------- | -------------------- | -------------------------------------- |
| Mod          | Claude Code skips the hook, and the call runs | Nothing to do        | Add a `.catch` that returns `{ deny }` |
| `pi.ts`      | pi blocks the call                            | Catch in the handler | Nothing to do                          |
| `command.ts` | Node exits 1, which does not block            | Nothing to do        | Catch, then exit 2                     |

A mod module that does not load has no `.catch`, so a mod cannot fail closed on a load error.

## Wiring

| Agent                     | Where                                      | Change                                                                                                               |
| ------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Claude Code, mod          | `dot_claude/settings.json.tmpl`            | Add the hook name to the `list` in `CLAUDE_CODE_PLUGIN_DIRS`                                                         |
| Claude Code, command hook | `dot_claude/settings.json.tmpl`            | `command -v node >/dev/null \|\| exit 0; NODE_COMPILE_CACHE=... node "$HOME/.claude/hooks/<hook>/command.ts"`        |
| pi                        | `dot_pi/agent/modify_settings.json`        | Add `~/.claude/hooks/<hook>/pi.ts` to `extensions`                                                                   |
| omp                       | `dot_omp/private_agent/private_config.yml` | Add the same path to `extensions`                                                                                    |
| Codex                     | `dot_codex/modify_hooks.json`              | `command -v node >/dev/null \|\| exit 0; NODE_COMPILE_CACHE="$HOME/.cache/node-compile-cache" node ".../command.ts"` |

A file hook in Codex runs through `dot_codex/hooks/apply-patch.ts <command.ts>` on `apply_patch`, because that payload has no `file_path`. A command entry exits 0 when `node` is missing. For a hook that runs as a command, add its name to the warning text of the `SessionStart` entry that checks `node`, in each agent that runs it.

To turn a hook off in one agent, remove its line from that agent's wiring.

## Add a hook

1. **Code:** write `core.ts`, and `io.ts` and the adapters that the hook needs.
2. **Tests:** write `test/check.ts`. Test the core with stub I/O, and each adapter with a stub `$`, a stub pi, or stdin for `command.ts`. `claude plugin test` cannot run a hook that reads a file, see [`platforms.md`](platforms.md#claude-code-mods).
3. **Wire:** add the entries in the [wiring table](#wiring).
4. **Docs:** write the hook README (agents table, failure behavior, dependencies, tests, files), and add its row to `dot_claude/hooks/README.md`.
5. **Check:** run `just chezmoi`, start one interactive Claude Code session so that the engine writes the mod types, then run `just hooks-check`. Make one live call in Claude Code, pi, omp, and Codex.
6. **Commit and apply** in the devcontainer and on the host.
7. **Trust** each new or changed Codex entry in the Codex TUI, on both machines.

To remove a file that chezmoi deployed before, add its home path to `.chezmoiremove`.
