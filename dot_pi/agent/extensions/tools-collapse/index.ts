/** Collapse built-in previews and codemode script/output through Pi 1.5's renderer API.
 * Display only: keep execution, settings, tool selection, results, and context unchanged.
 * Keep native errors and expanded views. No animations, token estimates, or settings.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
  Text,
  replaceControlCharacters,
  stripTerminalSequences,
} from "@earendil-works/pi-tui";

const tools = new Set([
  "bash",
  "powershell",
  "read",
  "write",
  "edit",
  "grep",
  "find",
  "ls",
  "codemode",
]);

export default function toolsCollapse(pi: ExtensionAPI): void {
  pi.registerToolRenderer((name, next) => {
    const base = next();
    if (!tools.has(name) || !base?.renderResult) return base;
    const rows = new WeakMap<object, { call?: Component; result?: Component }>();
    const rowFor = (state: object) => {
      let row = rows.get(state);
      if (!row) {
        row = {};
        rows.set(state, row);
      }
      return row;
    };
    return {
      ...base,
      renderCall(args, theme, context) {
        const row = rowFor(context.state);
        row.call = base.renderCall?.(args, theme, { ...context, lastComponent: row.call });
        if (!context.expanded && !context.isError && ["edit", "write", "codemode"].includes(name)) {
          const path = (args as { path?: unknown })?.path;
          const label =
            name === "codemode"
              ? ""
              : replaceControlCharacters(
                  stripTerminalSequences(typeof path === "string" ? path : ""),
                );
          return new Text(
            theme.fg("toolTitle", theme.bold(name)) +
              (label ? ` ${theme.fg("accent", label)}` : ""),
            base.renderShell === "self" ? context.outputPad : 0,
            0,
          );
        }
        return row.call ?? new Text(theme.fg("toolTitle", name), 0, 0);
      },
      renderResult(result, options, theme, context) {
        const row = rowFor(context.state);
        const hidden = !options.expanded && !context.isError;
        // Always run the native result renderer, including its final timer cleanup.
        row.result = base.renderResult?.(
          hidden && name === "codemode" ? { ...result, content: [] } : result,
          options,
          theme,
          { ...context, lastComponent: row.result },
        );
        return hidden && name !== "codemode" ? new Container() : (row.result ?? new Container());
      },
    };
  });
}
