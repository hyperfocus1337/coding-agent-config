/** Run with just pi-check. Uses Pi's installed loader and native TUI, without model calls. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pkg = process.env.PI_PACKAGE!;
const require = createRequire(path.join(pkg, "package.json"));
const load = (file: string) => import(pathToFileURL(path.join(pkg, file)).href);
const { loadExtensions } = await load("dist/core/extensions/loader.js");
const { initTheme } = await load("dist/modes/interactive/theme/theme.js");
const { ToolExecutionComponent } = await load(
  "dist/modes/interactive/components/tool-execution.js",
);
const { stripTerminalSequences, Container, Text } = await import(
  pathToFileURL(require.resolve("@earendil-works/pi-tui")).href
);
const factories = await load("dist/core/tools/index.js");
const { codemodeRenderers } = await load("dist/extensions/codemode/renderer.js");
initTheme("dark", false);
const loaded = await loadExtensions(
  [path.resolve(import.meta.dirname, "../index.ts")],
  process.cwd(),
);
assert.deepEqual(loaded.errors, []);
const extension = loaded.extensions[0];
assert.equal(extension.tools.size, 0, "Do not override execution or enable tools");
assert.equal(extension.handlers.size, 0, "Do not change results, context, or session state");
const resolver = extension.toolRenderers[0];
const thirdParty = { renderCall() {}, renderResult() {} };
assert.equal(
  resolver("mcp__test", () => thirdParty),
  thirdParty,
);
assert.equal(
  resolver("bash", () => undefined),
  undefined,
);
const noResult = { renderCall() {} };
assert.equal(
  resolver("bash", () => noResult),
  noResult,
);

const ui = { requestRender() {} };
const createRow = (name: string, args: any, base: any, resolve = resolver) =>
  new ToolExecutionComponent(
    name,
    `test-${name}`,
    args,
    {},
    resolve(name, () => base),
    ui,
    process.cwd(),
  );
const lines = (row: any) => stripTerminalSequences(row.render(100).join("\n"));
const complete = (row: any, isError = false, details: any = undefined) => {
  row.updateResult({
    content: [{ type: "text", text: "OUTPUT_MARKER" }],
    details,
    isError,
    durationMs: 17,
  });
};

for (const name of ["bash", "powershell", "read", "write", "edit", "grep", "find", "ls"]) {
  const title = name === "powershell" ? "PowerShell" : name[0].toUpperCase() + name.slice(1);
  const factory = factories[`create${title}ToolDefinition`];
  const base = factory(process.cwd());
  const args = {
    command: "echo command",
    path: "test.txt",
    pattern: "pattern",
    content: "WRITE_MARKER",
    edits: [{ oldText: "old", newText: "EDIT_MARKER" }],
  };
  const row = createRow(name, args, base);
  // Leave args incomplete to avoid the edit renderer's asynchronous filesystem preview.
  assert.doesNotMatch(lines(row), /WRITE_MARKER|EDIT_MARKER/);
  row.markExecutionStarted();
  complete(
    row,
    false,
    name === "edit" ? { diff: "+1 EDIT_MARKER", firstChangedLine: 1 } : undefined,
  );
  assert.doesNotMatch(lines(row), /OUTPUT_MARKER|WRITE_MARKER|EDIT_MARKER/);
  row.setExpanded(true);
  assert.match(
    lines(row),
    name === "edit" ? /EDIT_MARKER/ : name === "write" ? /WRITE_MARKER/ : /OUTPUT_MARKER/,
  );
  row.setExpanded(false);
  assert.doesNotMatch(lines(row), /OUTPUT_MARKER|WRITE_MARKER|EDIT_MARKER/);
  complete(row, true);
  assert.match(lines(row), /OUTPUT_MARKER/, `${name} must keep errors visible`);
}

const code = createRow("codemode", { code: 'console.log("SCRIPT_MARKER")' }, codemodeRenderers);
code.markExecutionStarted();
assert.doesNotMatch(lines(code), /SCRIPT_MARKER/);
const details = {
  calls: [{ name: "read", args: "test.txt", status: "ok", durationMs: 12 }],
};
complete(code, false, details);
assert.match(lines(code), /read.*test.txt.*12ms/);
assert.doesNotMatch(lines(code), /SCRIPT_MARKER|OUTPUT_MARKER/);
assert.match(lines(code), /Took/);
code.setExpanded(true);
assert.match(lines(code), /SCRIPT_MARKER/);
assert.match(lines(code), /OUTPUT_MARKER/);
code.setExpanded(false);
complete(code, true, details);
assert.match(lines(code), /OUTPUT_MARKER/);

// Delegated slots must never receive the compact header or empty result component.
const state = {};
let finalRenders = 0;
const wrapped = resolver("write", () => ({
  renderCall(_args: any, _theme: any, context: any) {
    assert.ok(!context.lastComponent || context.lastComponent instanceof Container);
    return context.lastComponent ?? new Container();
  },
  renderResult(_result: any, options: any, _theme: any, context: any) {
    assert.ok(!context.lastComponent || context.lastComponent instanceof Text);
    if (!options.isPartial) finalRenders++;
    return context.lastComponent ?? new Text("native", 0, 0);
  },
}));
const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
for (const expanded of [false, true, false, true]) {
  const context = { state, expanded, isError: false, outputPad: 0 };
  wrapped.renderCall({ path: "test.txt" }, theme, context);
  wrapped.renderResult({ content: [] }, { expanded, isPartial: false }, theme, context);
}
assert.equal(finalRenders, 4, "Hidden final results must still run native cleanup");

// tool-overview must wrap this renderer, so opening a batch also opens native slots.
const overview = await loadExtensions(
  [path.resolve(import.meta.dirname, "../../tool-overview/index.ts")],
  process.cwd(),
);
assert.deepEqual(overview.errors, []);
const ext = overview.extensions[0];
let open = false;
const ctx = {
  mode: "tui",
  ui: { getToolsExpanded: () => open },
  sessionManager: { getBranch: () => [] },
};
const emit = async (name: string, event: any) => {
  for (const handler of ext.handlers.get(name) ?? []) await handler(event, ctx);
};
await emit("session_start", {});
await emit("tool_execution_start", {
  toolCallId: "test-write",
  toolName: "write",
  args: { path: "test.txt" },
});
const composed = (name: string, next: any) =>
  ext.toolRenderers[0](name, () => resolver(name, next));
const batch = createRow(
  "write",
  { path: "test.txt", content: "WRITE_MARKER" },
  factories.createWriteToolDefinition(process.cwd()),
  composed,
);
complete(batch);
assert.match(lines(batch), /Tools: write/);
assert.doesNotMatch(lines(batch), /WRITE_MARKER/);
open = true;
batch.setExpanded(true);
assert.match(lines(batch), /WRITE_MARKER/);
await emit("session_shutdown", {});
console.log(
  "tools-collapse: native tools, errors, expansion, codemode rows/timing, component reuse, cleanup, and tool-overview passed",
);
