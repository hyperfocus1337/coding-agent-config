/** Run with PI_PACKAGE set to the installed Pi package, or use just pi-check. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { expandRepeatedPaste } from "../paste.ts";

assert.ok(process.env.PI_PACKAGE, "Set PI_PACKAGE or run just pi-check");
const require = createRequire(path.join(process.env.PI_PACKAGE, "package.json"));
const { Editor } = await import(pathToFileURL(require.resolve("@earendil-works/pi-tui")).href);
const theme = {
  borderColor: (text: string) => text,
  selectList: {
    selectedPrefix: (text: string) => text,
    selectedText: (text: string) => text,
    description: (text: string) => text,
    scrollInfo: (text: string) => text,
    noMatch: (text: string) => text,
  },
};
function make() {
  const editor = new Editor({ requestRender() {}, terminal: { rows: 40 } }, theme);
  assert.equal(expandRepeatedPaste(editor), true, "Installed Pi paste API changed");
  return editor;
}
function paste(editor: any, text: string) {
  editor.handleInput(`\x1b[200~${text}\x1b[201~`);
}
const long = "a".repeat(1001);
const multiline = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n");
let checks = 0;
function check(name: string, run: () => void) {
  try {
    run();
    checks++;
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
check("second paste expands long and multiline text; third paste inserts normally", () => {
  for (const text of [long, multiline]) {
    const editor = make();
    paste(editor, text);
    assert.match(editor.getText(), /^\[paste #1 /);
    assert.equal(editor.getExpandedText(), text);
    paste(editor, text);
    assert.equal(editor.getText(), text);
    assert.equal(editor.getExpandedText(), text);
    paste(editor, text);
    assert.equal(editor.getExpandedText(), text + text);
  }
});
check("short text and the exact collapse limits stay native", () => {
  for (const text of ["hello", "x".repeat(1000), Array(10).fill("line").join("\n")]) {
    const editor = make();
    paste(editor, text);
    paste(editor, text);
    assert.equal(editor.getText(), text + text);
  }
});
check("different text creates a separate paste; only the last paste expands", () => {
  const editor = make();
  paste(editor, long);
  const first = editor.getText();
  paste(editor, multiline);
  paste(editor, multiline);
  assert.equal(editor.getText(), first + multiline);
  assert.equal(editor.getExpandedText(), long + multiline);
});
check("expansion preserves prefix, suffix, cursor, Unicode, and native normalization", () => {
  const editor = make();
  editor.setText("前文 suffix");
  editor.handleInput("\x01"); // Ctrl+A
  editor.handleInput("\x1b[C");
  editor.handleInput("\x1b[C");
  const text = `${multiline}\r\n\t😀\x00`;
  const clean = `${multiline}\n    😀`;
  paste(editor, text);
  paste(editor, text);
  assert.equal(editor.getText(), "前文" + clean + " suffix");
  assert.deepEqual(editor.getCursor(), { line: 12, col: "    😀".length });
});
check("expansion is one undo step and restores the paste storage", () => {
  const editor = make();
  paste(editor, long);
  const marker = editor.getText();
  paste(editor, long);
  editor.handleInput("\x1f"); // Ctrl+_ / Ctrl+-
  assert.equal(editor.getText(), marker);
  assert.equal(editor.getExpandedText(), long);
  editor.handleInput("\x1f");
  assert.equal(editor.getText(), "");
});
check("typing, moving away and back, and programmatic replacement cancel expansion", () => {
  for (const intervene of [
    (editor: any) => editor.handleInput("x"),
    (editor: any) => {
      editor.handleInput("\x1b[D");
      editor.handleInput("\x1b[C");
    },
    (editor: any) => editor.setText("changed"),
  ]) {
    const editor = make();
    paste(editor, long);
    intervene(editor);
    const before = editor.getExpandedText();
    paste(editor, long);
    assert.equal(editor.getExpandedText(), before + long);
  }
});
check("native buffering handles chunked paste and trailing input", () => {
  const editor = make();
  for (let count = 0; count < 2; count++) {
    editor.handleInput("\x1b[200~");
    editor.handleInput(long.slice(0, 500));
    editor.handleInput(long.slice(500));
    editor.handleInput("\x1b[201~");
  }
  assert.equal(editor.getText(), long);
  const other = make();
  other.handleInput(`\x1b[200~${long}\x1b[201~x`);
  paste(other, long);
  assert.equal(other.getExpandedText(), long + "x" + long);
});
check("submission sends the full text with or without expansion", () => {
  for (const expand of [false, true]) {
    const editor = make();
    let submitted = "";
    editor.onSubmit = (text: string) => {
      submitted = text;
    };
    paste(editor, multiline);
    if (expand) paste(editor, multiline);
    editor.handleInput("\r");
    assert.equal(submitted, multiline);
    assert.equal(editor.getText(), "");
  }
});
check("unsupported editors are left unchanged", () => {
  const editor = { handleInput() {} };
  const original = editor.handleInput;
  assert.equal(expandRepeatedPaste(editor as any), false);
  assert.equal(editor.handleInput, original);
});
const { loadExtensions } = await import(
  pathToFileURL(path.join(process.env.PI_PACKAGE, "dist/core/extensions/loader.js")).href
);
const loaded = await loadExtensions(
  [path.resolve(import.meta.dirname, "../index.ts")],
  process.cwd(),
);
assert.deepEqual(loaded.errors, []);
const start = loaded.extensions[0].handlers.get("session_start")[0];
await start({}, { mode: "print" });
const existing = new Editor({ requestRender() {}, terminal: { rows: 40 } }, theme);
let factory: any;
const notices: string[] = [];
await start(
  {},
  {
    mode: "tui",
    ui: {
      getEditorComponent: () => () => existing,
      setEditorComponent: (value: any) => {
        factory = value;
      },
      notify: (message: string) => notices.push(message),
    },
  },
);
assert.equal(factory(), existing, "Keep the existing editor instance and its wrappers");
paste(existing, long);
paste(existing, long);
assert.equal(existing.getText(), long);
assert.deepEqual(notices, []);
console.log(`expand-paste: ${checks} checks plus Pi loading and editor composition passed`);
