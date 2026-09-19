# Implementation notes

Why the override is shaped this way. [README.md](../README.md) describes what a row shows; this file is for a person changing the code. Written against pi 0.85.1.

## Replacing one renderer means replacing the tool

`ToolDefinition` carries `execute`, `renderCall` and `renderResult` in one object, and `pi.registerTool` is the only way in. A tool registered under the name of a built-in replaces that built-in, so the extension calls `createBashToolDefinition`, spreads the result, and overwrites `renderResult`. Everything else in the spread is pi's own: `parameters`, `description`, `promptSnippet`, `promptGuidelines`, `renderCall`, `renderShell`.

`execute` is overwritten too, but only to delegate. pi builds its built-ins in `AgentSession._buildRuntime` with the session's directory and the shell settings, and neither reaches an extension: `ctx.cwd` is on the execution context, so `execute` picks the definition for that directory out of a `Map` and builds one on the first call from a new directory. A resumed session keeps the directory it was started in, which is why `process.cwd()` is not enough. The shell settings are read from `~/.pi/agent/settings.json` directly, since no API exposes them.

pi's renderer inheritance is per slot, so an override that omits `renderCall` keeps the built-in one. The spread already copies it, and copying is what keeps the elapsed clock working: `renderCall` writes `startedAt` into the row state that `renderResult` reads.

## The row state holds two components

`tool-execution.ts` keeps the component a renderer returned last and hands it back as `context.lastComponent`. pi's `bash` renderer reuses it as a `BashResultRenderComponent`, and this extension reuses it as a `Text`. Passing one to the other throws, which pi catches and answers with its generic ten-line fallback, so the two are kept in separate slots on `context.state`, the object both renderers share for the row. The extension writes `line` and `built` there; `bash` writes `startedAt`, `endedAt` and `interval`.

`interval` is the one piece of the built-in's state the extension touches. The built-in starts a one-second timer while a command streams, to redraw its elapsed clock, and clears it in the first render where the result is no longer partial. That render is the one the summary line replaces, so the extension clears the timer itself when it draws the final line. Without it, a row that was expanded during a long command and collapsed before it finished would redraw once a second forever.

## What is delegated, and when

`summary()` in [`../summary.ts`](../summary.ts) returns `undefined` for an expanded row, a failed call, and a result with no text; the extension then calls the built-in renderer. The rule is that the summary only ever replaces output that pi would show as a preview of a successful command, so nothing is hidden: `ctrl+o` and a non-zero exit code both produce pi's own view.

`summary.ts` is a separate module because `index.ts` imports pi's package, which only resolves inside a pi session. `node test/check.ts` can import the summary module, and does; `check.sh` passes `PI_PACKAGE` so the last group can read the installed package as text rather than import it.

## Probing a live session

`node` cannot resolve pi's package from this repository, and pi aliases the module names for extensions at run time through jiti. A probe outside a session needs a directory with `node_modules/@earendil-works/pi-coding-agent` and `.../pi-tui` symlinked to the installed package, a copy of the extension beside it, and `initTheme()` from `dist/modes/interactive/theme/theme.js`, which the built-in renderers require. From there the default export takes a stub `{ registerTool }`, and `renderResult` can be called with a fake theme (`fg: (_colour, text) => text`) and a row state of `{}`: collapsed returns `42 lines`, expanded returns pi's lines, and toggling between them repeatedly shows whether the two component slots are kept apart.

In a real session, `pi --mode json -p "..."` shows which tools the model was given, which is how the earlier version of this extension was caught: it also registered `grep`, `find` and `ls`, and an extension tool is active in every session, so the model started calling `ls` where it had used `bash` before.
