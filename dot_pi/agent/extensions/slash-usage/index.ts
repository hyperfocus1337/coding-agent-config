/** Put frequently submitted slash commands first without changing typed searches. */
import * as path from "node:path";
import { CustomEditor, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { rankCommands, readUsage, recordUsage, trackSubmissions } from "./usage.ts";

export default function slashUsage(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const file = path.join(getAgentDir(), "data", "slash-usage.jsonl");
    let warned = false;
    const warn = (error: unknown) => {
      if (warned) return;
      warned = true;
      ctx.ui.notify(
        `Slash usage: ${error instanceof Error ? error.message : String(error)}`,
        "warning",
      );
    };
    ctx.ui.addAutocompleteProvider((current) =>
      rankCommands(current, () => {
        try {
          return readUsage(file);
        } catch (error) {
          warn(error);
          return new Map();
        }
      }),
    );
    const existing = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor =
        existing?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
      trackSubmissions(editor, (text) => {
        try {
          recordUsage(file, text);
        } catch (error) {
          // History failure must not prevent command execution.
          warn(error);
        }
      });
      return editor;
    });
  });
}
