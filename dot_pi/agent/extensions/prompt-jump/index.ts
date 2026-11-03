/** Move to the prompt boundaries with Cmd+Up/Down without replacing other editor extensions. */
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

// shortcut: Pi 1.4 has no public cursor setter. Use guarded internal movement methods until it does.
type JumpEditor = {
  handleInput(data: string): void;
  isInPaste: boolean;
  jumpMode: string | null;
  cancelAutocomplete(): void;
  pageScroll(direction: number): void;
  moveToLineStart(): void;
  moveToLineEnd(): void;
};

export default function promptJump(pi: ExtensionAPI): void {
  pi.registerCommand("prompt-jump-debug", {
    description: "Show the next terminal key received by Pi to diagnose prompt navigation",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") return;
      const data = await ctx.ui.custom<string>((_tui, _theme, _keybindings, done) => ({
        render: (width: number) => [
          truncateToWidth("Press Cmd+Up or Cmd+Down. If nothing happens, press Escape.", width),
        ],
        handleInput: (input: string) => done(input),
        invalidate() {},
      }));
      const start = matchesKey(data, "super+up") || matchesKey(data, "ctrl+alt+shift+up");
      const end = matchesKey(data, "super+down") || matchesKey(data, "ctrl+alt+shift+down");
      ctx.ui.notify(
        `Prompt jump: ${JSON.stringify(data)}; ${start ? "prompt start" : end ? "prompt end" : "not a jump key"}`,
        "info",
      );
    },
  });
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const existing = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor =
        existing?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
      const jump = editor as unknown as JumpEditor;
      if (
        typeof jump.isInPaste !== "boolean" ||
        !["cancelAutocomplete", "pageScroll", "moveToLineStart", "moveToLineEnd"].every(
          (name) => typeof (jump as unknown as Record<string, unknown>)[name] === "function",
        )
      ) {
        ctx.ui.notify("Prompt jump: this editor does not support Pi's movement API", "warning");
        return editor;
      }
      const handleInput = editor.handleInput.bind(editor);
      editor.handleInput = (data: string) => {
        const start = matchesKey(data, "super+up") || matchesKey(data, "ctrl+alt+shift+up");
        const end = matchesKey(data, "super+down") || matchesKey(data, "ctrl+alt+shift+down");
        if (jump.isInPaste || (!start && !end)) return handleInput(data);
        jump.jumpMode = null;
        jump.cancelAutocomplete();
        jump.pageScroll(start ? -Infinity : Infinity);
        if (start) jump.moveToLineStart();
        else jump.moveToLineEnd();
        tui.requestRender();
      };
      return editor;
    });
  });
}
