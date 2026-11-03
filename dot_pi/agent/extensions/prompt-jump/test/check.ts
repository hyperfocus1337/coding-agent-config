/** Run with just pi-check to test against the installed Pi editor and extension loader. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

assert.ok(process.env.PI_PACKAGE, "Set PI_PACKAGE or run just pi-check");
const require = createRequire(path.join(process.env.PI_PACKAGE, "package.json"));
const { matchesKey, visibleWidth } = await import(
  pathToFileURL(require.resolve("@earendil-works/pi-tui")).href
);
const { CustomEditor } = await import(
  pathToFileURL(path.join(process.env.PI_PACKAGE, "dist/index.js")).href
);
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
await start({}, { mode: "rpc" });
const up = "\x1b[1;9A";
const down = "\x1b[1;9B";
assert.equal(matchesKey(up, "super+up"), true);
assert.equal(matchesKey(down, "super+down"), true);
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
let renders = 0;
const tui = {
  requestRender() {
    renders++;
  },
  terminal: { rows: 40 },
};
const keybindings = { matches: () => false };
const notices: string[] = [];
async function wrap(existing?: any) {
  let factory: any;
  await start(
    {},
    {
      mode: "tui",
      ui: {
        getEditorComponent: () => existing && (() => existing),
        setEditorComponent: (value: any) => {
          factory = value;
        },
        notify: (message: string) => notices.push(message),
      },
    },
  );
  const editor = factory(tui, theme, keybindings);
  if (existing) assert.equal(editor, existing, "Preserve the existing editor instance");
  return editor;
}
const editor = await wrap();
editor.addToHistory("older prompt");
for (const text of [
  "",
  "single line",
  "first\nsecond\nlast",
  "\n\n",
  "前😀\n中\né😀",
  "x".repeat(200) + "\nlast",
  "first\n",
]) {
  editor.setText(text);
  editor.render(20);
  for (let repeat = 0; repeat < 2; repeat++) {
    editor.handleInput(up);
    assert.deepEqual(editor.getCursor(), { line: 0, col: 0 });
    editor.render(20);
    editor.handleInput(down);
    const lines = text.split("\n");
    assert.deepEqual(editor.getCursor(), { line: lines.length - 1, col: lines.at(-1)!.length });
    editor.render(20);
    assert.equal(editor.getText(), text, "Jump must not browse history or edit text");
  }
}
// The host Ghostty config translates Cmd+arrows for Emacs; preserve that mapping in Pi too.
editor.setText("first\nsecond\nlast");
editor.handleInput("\x1b[1;8A");
assert.deepEqual(editor.getCursor(), { line: 0, col: 0 });
editor.handleInput("\x1b[1;8B");
assert.deepEqual(editor.getCursor(), { line: 2, col: 4 });
assert.equal(editor.getText(), "first\nsecond\nlast");
assert.ok(renders > 0);
editor.setText("first\nsecond\nlast");
editor.handleInput(up);
editor.handleInput("X");
editor.handleInput(down);
editor.handleInput("Y");
assert.equal(editor.getText(), "Xfirst\nsecond\nlastY");
editor.handleInput("\x1f");
assert.equal(editor.getText(), "Xfirst\nsecond\nlast", "Jump must not add undo steps");
editor.handleInput("\x1f");
assert.equal(editor.getText(), "first\nsecond\nlast");
editor.handleInput(up);
editor.handleInput("\x1b[B");
assert.deepEqual(editor.getCursor(), { line: 1, col: 0 }, "Ordinary arrows still work");
let submitted = "";
editor.onSubmit = (text: string) => {
  submitted = text;
};
editor.handleInput(down);
editor.handleInput("\r");
assert.equal(submitted, "first\nsecond\nlast");
editor.setText("first\nlast");
editor.jumpMode = "forward";
editor.autocompleteState = "test";
editor.handleInput(up);
assert.equal(editor.jumpMode, null);
assert.equal(editor.isShowingAutocomplete(), false);
editor.setText("");
editor.handleInput("\x1b[200~");
editor.handleInput(up);
editor.handleInput("\x1b[201~");
assert.notEqual(
  editor.getText(),
  "",
  "Key-like data inside a paste must reach the native paste handler",
);

// Exercise the same wrapper chain as the existing expand-paste and slash-usage extensions.
const { expandRepeatedPaste } = await import("../../expand-paste/paste.ts");
const { trackSubmissions } = await import("../../slash-usage/usage.ts");
const existing = new CustomEditor(tui, theme, keybindings);
assert.equal(expandRepeatedPaste(existing), true);
const composed = await wrap(existing);
const submissions: string[] = [];
trackSubmissions(composed, (text: string) => submissions.push(text));
const multiline = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n");
const paste = `\x1b[200~${multiline}\x1b[201~`;
composed.handleInput(paste);
composed.handleInput(paste);
assert.equal(composed.getText(), multiline);
composed.handleInput(up);
assert.deepEqual(composed.getCursor(), { line: 0, col: 0 });
composed.handleInput(down);
composed.handleInput("\r");
assert.deepEqual(submissions, [multiline]);
assert.deepEqual(notices, []);
const unsupported = { handleInput() {} };
const original = unsupported.handleInput;
await wrap(unsupported);
assert.equal(unsupported.handleInput, original);
assert.equal(notices.length, 1);
const debug = loaded.extensions[0].commands.get("prompt-jump-debug");
assert.ok(debug);
await debug.handler("", { mode: "print" });
for (const [input, expected] of [
  [up, "prompt start"],
  [down, "prompt end"],
  ["\x1b[1;8A", "prompt start"],
  ["\x1b[1;8B", "prompt end"],
  ["\x1b", "not a jump key"],
]) {
  let message = "";
  await debug.handler("", {
    mode: "tui",
    ui: {
      custom: (factory: any) =>
        new Promise((done) => {
          const component = factory(tui, theme, keybindings, done);
          assert.ok(visibleWidth(component.render(20)[0]) <= 20);
          component.handleInput(input);
        }),
      notify: (text: string) => {
        message = text;
      },
    },
  });
  assert.ok(message.includes(JSON.stringify(input)));
  assert.ok(message.endsWith(expected));
}
console.log("prompt-jump: movement, editor composition, and key diagnostics passed");
