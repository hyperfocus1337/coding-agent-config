# compact-bash

Replaces the output preview under a `bash` call with one line, `42 lines`. pi prints the last five lines of output below every command it runs; this prints the count instead, and gives the five lines back the moment you ask for them.

## What a row shows

| Row                          | Output below the command                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| collapsed, command succeeded | `42 lines`, `42 lines so far` while it runs, `42 lines (truncated)` when pi cut the output |
| collapsed, command failed    | pi's five-line preview, unchanged                                                          |
| expanded, `ctrl+o`           | pi's full output, unchanged                                                                |
| no output                    | nothing, as before                                                                         |

The command line above the row is pi's own and does not change. `ctrl+o` toggles every row in the transcript at once, and a left click on one row toggles that row alone, which needs the fullscreen TUI: `/settings`, entry "TUI mode", value fullscreen.

Nothing is dropped. The renderer only draws, so the full output stays in the session file and in what the model reads. pi still cuts a result above 50 KB or 2000 lines before any renderer sees it, which is the cut `(truncated)` reports.

## Why it is an extension

pi has no setting for the preview. Its size is a constant in the renderer, `BASH_PREVIEW_LINES = 5` in `dist/core/tools/renderers/bash.js`, and the only way to replace a built-in tool's rendering is to register a tool under the name of that built-in, which replaces the whole tool.

So the extension re-creates pi's own `bash` definition and changes one field. The schema, the description, the prompt metadata and `renderCall` are pi's. `execute` is handed back to pi's tool, built for the directory the call comes from, with `shellPath` and `shellCommandPrefix` read from `~/.pi/agent/settings.json`, which is where pi reads them.

## Only `bash`

| Tool                 | Why it is left alone                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read`               | A collapsed `read` already prints nothing.                                                                                                                                                                            |
| `write`, `edit`      | Their previews are drawn by `renderCall`, which carries the arguments as well, so a `renderResult` cannot reach them.                                                                                                 |
| `grep`, `find`, `ls` | They are not in pi's default tool set, `read`, `bash`, `edit` and `write`, and a tool an extension registers is active in every session. An entry for one of them would hand the model a tool it does not have today. |

## Not carried over

- Project-scope `.pi/settings.json`: this repository holds user scope only, so a project that sets `shellPath` or `shellCommandPrefix` there runs its commands through the user-scope value.
- `powershell`, the Windows shell tool, which this repository does not use.

## Turning it off

`PI_COMPACT_BASH=0 pi` starts a session with pi's own preview and keeps the other extensions loaded. `pi --no-extensions` also turns it off, together with `claude-commands` and `claude-rules`. The variable is read once, when pi loads the extension, so it is per session.

## Checks

`node test/check.ts` from this directory, or `just pi-check` for the type check as well. The checks cover the summary line, the three cases that keep pi's own output (expanded, failed, no output), and the installed pi package: the factory export the extension builds on, the five-line constant this README names, and `renderResult` on the tool definition.

For the render state the two renderers share, and for how the override was verified, see [docs/implementation.md](docs/implementation.md).
