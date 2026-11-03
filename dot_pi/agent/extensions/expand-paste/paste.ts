import type { EditorComponent } from "@earendil-works/pi-tui";

interface PasteEditor {
  state: { lines: string[]; cursorLine: number; cursorCol: number };
  pastes: Map<number, string>;
  isInPaste: boolean;
  lastAction: unknown;
  getText(): string;
  handleInput(data: string): void;
  handlePaste(text: string): void;
  cancelAutocomplete(): void;
  exitHistoryBrowsing(): void;
  pushUndoSnapshot(): void;
  insertTextAtCursorInternal(text: string): void;
}

/** Wrap the existing editor so other editor extensions remain active. */
export function expandRepeatedPaste(component: EditorComponent): boolean {
  // shortcut: Pi 1.4 keeps paste storage and replacement private. Check these members until Pi
  // exposes a public single-marker expansion API; the self-check runs against the installed Pi.
  const editor = component as unknown as PasteEditor;
  if (
    !(editor.pastes instanceof Map) ||
    !Array.isArray(editor.state?.lines) ||
    [
      "handleInput",
      "handlePaste",
      "cancelAutocomplete",
      "exitHistoryBrowsing",
      "pushUndoSnapshot",
      "insertTextAtCursorInternal",
    ].some((name) => typeof (editor as unknown as Record<string, unknown>)[name] !== "function")
  ) {
    return false;
  }
  let previous:
    | { raw: string; text: string; line: number; col: number; marker: string; id: number }
    | undefined;
  const handleInput = editor.handleInput.bind(editor);
  editor.handleInput = (data) => {
    if (!editor.isInPaste && !data.includes("\x1b[200~")) previous = undefined;
    handleInput(data);
  };
  const handlePaste = editor.handlePaste.bind(editor);
  editor.handlePaste = (raw) => {
    const last = previous;
    previous = undefined;
    const { cursorLine: line, cursorCol: col } = editor.state;
    const content = last && editor.pastes.get(last.id);
    if (
      last &&
      content !== undefined &&
      raw === last.raw &&
      editor.getText() === last.text &&
      line === last.line &&
      col === last.col
    ) {
      editor.cancelAutocomplete();
      editor.exitHistoryBrowsing();
      editor.lastAction = null;
      editor.pushUndoSnapshot();
      const start = col - last.marker.length;
      editor.state.lines[line] =
        editor.state.lines[line].slice(0, start) + editor.state.lines[line].slice(col);
      editor.state.cursorCol = start;
      editor.pastes.delete(last.id);
      editor.insertTextAtCursorInternal(content);
      return;
    }
    const before = editor.getText();
    handlePaste(raw);
    const text = editor.getText();
    const cursor = editor.state;
    const length = text.length - before.length;
    const marker = cursor.lines[cursor.cursorLine].slice(
      cursor.cursorCol - length,
      cursor.cursorCol,
    );
    const match = /^\[paste #(\d+) (?:\+\d+ lines|\d+ chars)\]$/.exec(marker);
    if (match && editor.pastes.has(Number(match[1]))) {
      previous = {
        raw,
        text,
        line: cursor.cursorLine,
        col: cursor.cursorCol,
        marker,
        id: Number(match[1]),
      };
    }
  };
  return true;
}
