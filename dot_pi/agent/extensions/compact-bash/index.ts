/**
 * Compact Bash Extension
 *
 * Replaces the five-line preview under a `bash` call with one line, `42 lines`.
 * `ctrl+o` on the row, or a command that fails, renders pi's own output
 * unchanged, so the preview is the only thing that goes away.
 *
 * pi has no setting for the preview: its size is a constant in the renderer,
 * `BASH_PREVIEW_LINES` in `dist/core/tools/renderers/bash.js`. Rendering is only
 * replaceable by registering a tool under the name of a built-in, which replaces
 * the whole tool, so this re-creates the built-in definition and keeps everything
 * but `renderResult`: schema, description, prompt metadata, `renderCall`, and
 * `execute`, which is handed back to the built-in.
 *
 * `bash` is the only tool here:
 *
 * - `read` already prints nothing when its row is collapsed.
 * - The `write` and `edit` previews are drawn by `renderCall`, which carries the
 *   arguments as well, so a `renderResult` cannot reach them.
 * - `grep`, `find` and `ls` are not in pi's default tool set, and a tool an
 *   extension registers is active in every session, so an entry for one of them
 *   would also hand the model a tool it does not have today.
 *
 * Not carried over: `.pi/settings.json`, because this repository holds user scope
 * only. A project that sets `shellPath` or `shellCommandPrefix` there runs its
 * commands through the user-scope value instead.
 *
 * `PI_COMPACT_BASH=0 pi` starts a session without the override and keeps the other
 * extensions loaded, which `pi --no-extensions` does not.
 *
 * Reference: pi's `examples/extensions/built-in-tool-renderer.ts`, and
 * `docs/extensions.md`, "Overriding Built-in Tools".
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type BashToolOptions,
  createBashToolDefinition,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Component, Text } from "@earendil-works/pi-tui";
import { type Details, summary } from "./summary.ts";

/**
 * Our own slots in the state pi shares across one tool row. Each renderer reuses
 * the component it returned last, so the summary line is kept apart from the
 * built-in's component: handing either one the other's component throws.
 */
interface RowState {
  line?: Text;
  built?: Component;
  /** The built-in's one-second timer for its elapsed clock. */
  interval?: ReturnType<typeof setInterval>;
}

/**
 * The shell pi would give the built-in. pi reads these two settings itself and
 * passes them to the tool it builds; no API hands them to an extension, so they
 * are read from the same file.
 */
function shellOptions(): BashToolOptions {
  let settings: { shellPath?: string; shellCommandPrefix?: string } = {};
  try {
    settings = JSON.parse(
      fs.readFileSync(
        path.join(os.homedir(), ".pi", "agent", "settings.json"),
        "utf-8",
      ),
    );
  } catch {
    // No file, or not JSON: pi falls back to the same defaults the built-in has.
  }
  return {
    shellPath: settings.shellPath,
    commandPrefix: settings.shellCommandPrefix,
  };
}

export default function compactBash(pi: ExtensionAPI): void {
  // The off switch. pi reads the environment of the process it starts in, so this
  // is per session: `PI_COMPACT_BASH=0 pi`.
  if (process.env.PI_COMPACT_BASH === "0") {
    return;
  }

  const byCwd = new Map<string, ToolDefinition<any, any, any>>();
  const definitionFor = (cwd: string): ToolDefinition<any, any, any> => {
    const definition =
      byCwd.get(cwd) ?? createBashToolDefinition(cwd, shellOptions());
    byCwd.set(cwd, definition);
    return definition;
  };

  const base = definitionFor(process.cwd());
  const renderBuiltIn = base.renderResult;
  if (renderBuiltIn === undefined) {
    // Nothing to fall back to on expand, so leave the built-in in place.
    return;
  }

  pi.registerTool({
    ...base,

    // A resumed session keeps the directory it was started in, which is not always
    // the process directory, and the built-in resolves a path against the directory
    // it was built for.
    execute: (toolCallId, params, signal, onUpdate, ctx) =>
      definitionFor(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx),

    renderResult: (result, options, theme, context) => {
      const state = context.state as RowState;
      const line = summary(
        result.content,
        options,
        context.isError,
        result.details as Details | undefined,
      );

      if (line === undefined) {
        state.built = renderBuiltIn(result, options, theme, {
          ...context,
          lastComponent: state.built,
        });
        return state.built;
      }

      // The built-in starts a one-second timer for its elapsed clock and clears it
      // in the final render, which is the render this line replaces.
      if (!options.isPartial && state.interval !== undefined) {
        clearInterval(state.interval);
        state.interval = undefined;
      }

      state.line ??= new Text("", 0, 0);
      state.line.setText(theme.fg("muted", line));
      return state.line;
    },
  });
}
