/** Expand a collapsed text paste when the same text is pasted again without an intervening key. */
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expandRepeatedPaste } from "./paste.ts";

export default function expandPaste(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const existing = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor =
        existing?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
      if (!expandRepeatedPaste(editor)) {
        ctx.ui.notify("Expand paste: this editor does not support Pi's paste API", "warning");
      }
      return editor;
    });
  });
}
