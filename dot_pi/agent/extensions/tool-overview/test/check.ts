/** Run through just pi-check. Uses installed Pi's loader and TUI, with no model traffic. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { acceptSummary, duration, evidence, fallback } from "../summary.ts";

assert.equal(
  acceptSummary("Read README.md and found 42 lines.", '{"output":"42 lines"}'),
  "Read README.md and found 42 lines.",
);
assert.equal(acceptSummary("Found 42 lines.", "142 lines"), undefined);
for (const text of ["", "one\ntwo", "\x1b[31mRead files.", Array(17).fill("word").join(" ")]) {
  assert.equal(acceptSummary(text, ""), undefined);
}
assert.equal(fallback([{ id: "a", name: "read", args: {} }]), "Ran 1 tool call.");
assert.equal(
  fallback([{ id: "a", name: "read", args: {}, failed: true }]),
  "Ran 1 tool call; 1 failed.",
);
assert.deepEqual([duration(47), duration(1200), duration(134_000)], ["47ms", "1.2s", "2m14s"]);
const huge = evidence(
  Array.from({ length: 100 }, (_, i) => ({
    id: `${i}`,
    name: "read",
    args: { path: "\\".repeat(10_000) },
    output: "\u0000".repeat(10_000),
  })),
);
assert.ok(huge.length <= 16_000);
assert.equal(JSON.parse(huge).calls, 100);
assert.ok(JSON.parse(huge).omittedCalls >= 36);

const pkg = process.env.PI_PACKAGE!;
const require = createRequire(path.join(pkg, "package.json"));
const { Text, visibleWidth, colorToHex } = await import(
  pathToFileURL(require.resolve("@earendil-works/pi-tui")).href
);
const { loadExtensions } = await import(
  pathToFileURL(path.join(pkg, "dist/core/extensions/loader.js")).href
);
const loaded = await loadExtensions(
  [path.resolve(import.meta.dirname, "../index.ts")],
  process.cwd(),
);
assert.deepEqual(loaded.errors, []);
const extension = loaded.extensions[0];
const handlers = extension.handlers;
assert.equal(extension.tools.size, 0, "Rendering must not replace tool execution or schemas");
assert.equal(handlers.has("context"), false);
assert.equal(handlers.has("before_agent_start"), false);
const resolver = extension.toolRenderers[0];
const emit = async (name: string, event: any = {}) => {
  for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
};
let globalOpen = false;
let branch: any[] = [];
let requests = 0;
let responseText = "Read README.md and ran tests.";
let responseError = false;
let replyGate: Promise<void> | undefined;
let capturedSignal: AbortSignal;
let capturedEvidence = "";
const receipts: any[] = [];
// appendEntry is a bound runtime action; the loader exposes its bindings for tests.
loaded.runtime.appendEntry = (customType: string, data: any) =>
  receipts.push({ type: "custom", customType, data });
const ctx: any = {
  mode: "tui",
  model: { id: "test", provider: "test" },
  sessionManager: { getBranch: () => branch },
  ui: { getToolsExpanded: () => globalOpen },
  modelRegistry: {
    streamSimple: (_model: any, input: any, options: any) => {
      requests++;
      capturedSignal = options.signal;
      capturedEvidence = input.messages[0].content[0].text;
      assert.equal(options.maxTokens, 256);
      assert.match(input.systemPrompt, /at most 16 words/);
      return {
        result: async () => {
          await replyGate;
          if (responseError) throw new Error("provider unavailable");
          return {
            content: [{ type: "text", text: responseText }],
            stopReason: "stop",
            usage: { totalTokens: 10 },
          };
        },
      };
    },
  },
};
const headerColors: string[] = [];
const theme = {
  appearance: "light",
  fg: (_color: string, text: string) => text,
  style: (text: string, options: any) => {
    headerColors.push(colorToHex(options.fg));
    return text;
  },
};
let renders = 0;
const makeRow = (id: string, name: string, args: any) => {
  const native = {
    renderCall: (_args: any, _theme: any, context: any) => {
      assert.ok(!context.lastComponent || context.lastComponent instanceof Text);
      const component = context.lastComponent ?? new Text("", 0, 0);
      component.setText(`${name} ${JSON.stringify(args)}`);
      return component;
    },
    renderResult: (_result: any, _options: any, _theme: any, context: any) => {
      assert.ok(!context.lastComponent || context.lastComponent instanceof Text);
      const component = context.lastComponent ?? new Text("", 0, 0);
      component.setText(`output ${id}`);
      return component;
    },
  };
  const renderer = resolver(name, () => native);
  const row: any = { renderer, call: undefined, result: undefined };
  let context: any = {
    state: {},
    toolCallId: id,
    expanded: false,
    isPartial: true,
    outputPad: 1,
    keyText: () => "ctrl+o",
  };
  row.draw = () => {
    renders++;
    assert.ok(renders < 1000, "Invalidation must not recurse or grow the refresh collection");
    context = { ...context, expanded: globalOpen, invalidate: () => row.draw() };
    row.call = renderer.renderCall(args, theme, context);
    row.result = renderer.renderResult(
      { content: [{ type: "text", text: `output ${id}` }] },
      { expanded: globalOpen, isPartial: false },
      theme,
      context,
    );
  };
  row.lines = (width = 100) => [...row.call.render(width), ...row.result.render(width)];
  row.click = () => {
    row.call.render(100);
    return row.call.handleMouse({
      type: "click",
      button: "left",
      x: 2,
      y: 0,
      width: 100,
      height: 5,
    });
  };
  row.draw();
  return row;
};
const assistant = (ids: string[]) => ({
  role: "assistant",
  content: ids.map((id) => ({
    type: "toolCall",
    id,
    name: id === "a" ? "read" : "bash",
    arguments: { path: "README.md" },
  })),
});

for (const mode of ["print", "json", "rpc"]) {
  ctx.mode = mode;
  await emit("session_start");
  const native = {};
  assert.equal(
    resolver("read", () => native),
    native,
  );
  await emit("message_end", { message: assistant(["hidden"]) });
  await emit("tool_execution_start", { toolCallId: "hidden", toolName: "read", args: {} });
  await emit("turn_end", { outcome: "completed" });
}
assert.equal(requests, 0, "No extra requests in headless or RPC modes");
ctx.mode = "tui";
await emit("session_start");
await emit("message_start", { message: assistant([]) });
await emit("message_update", { message: assistant(["a", "b"]) });
await emit("message_end", { message: assistant(["a", "b"]) });
const a = makeRow("a", "read", { path: "README.md" });
const b = makeRow("b", "bash", { command: "pnpm test" });
assert.match(a.lines().join("\n"), /2 calls/);
assert.equal(headerColors.at(-1)?.toLowerCase(), "#006b70");
theme.appearance = "dark";
a.draw();
assert.equal(headerColors.at(-1)?.toLowerCase(), "#65c7c0");
theme.appearance = "light";
a.draw();
assert.equal(headerColors.at(-1)?.toLowerCase(), "#006b70");
assert.deepEqual(b.lines(), [], "Collapsed sibling rows occupy no space");
for (const [id, toolName] of [
  ["a", "read"],
  ["b", "bash"],
]) {
  await emit("tool_execution_start", { toolCallId: id, toolName, args: { path: "README.md" } });
}
await emit("tool_execution_start", {
  toolCallId: "a/1",
  toolName: "nested",
  args: {},
  parentToolCallId: "a",
});
await emit("tool_execution_end", {
  toolCallId: "a/1",
  toolName: "nested",
  result: { content: [] },
  isError: false,
  parentToolCallId: "a",
});
await emit("tool_execution_end", {
  toolCallId: "b",
  toolName: "bash",
  result: { content: [{ type: "text", text: "tests passed" }] },
  isError: false,
  durationMs: 30,
});
await emit("tool_execution_end", {
  toolCallId: "a",
  toolName: "read",
  result: { content: [{ type: "text", text: "README.md: 42 lines" }] },
  isError: false,
  durationMs: 17,
});
await emit("turn_end", { outcome: "completed" });
assert.equal(requests, 1);
assert.equal(
  JSON.parse(capturedEvidence).calls,
  2,
  "Nested calls stay inside their parent's native display",
);
assert.match(a.lines().join("\n"), /Read README.md and ran tests/);
assert.equal(receipts.length, 1);
assert.deepEqual(receipts[0].data.ids, ["a", "b"]);
assert.deepEqual(receipts[0].data.usage, { totalTokens: 10 });
await emit("turn_end", { outcome: "completed" });
assert.equal(requests, 1, "Each batch is summarized once");
assert.equal(a.click().handled, true);
assert.match(a.lines().join("\n"), /output a/);
assert.match(b.lines().join("\n"), /output b/);
a.click();
assert.deepEqual(b.lines(), []);
globalOpen = true;
a.draw();
b.draw();
assert.match(b.lines().join("\n"), /output b/);
a.click();
assert.deepEqual(b.lines(), [], "A local collapse works even when global expansion is on");
globalOpen = false;
a.draw();
b.draw();
globalOpen = true;
a.draw();
b.draw();
assert.match(b.lines().join("\n"), /output b/, "Ctrl+O overrides prior local choices");
for (const width of [1, 12, 40]) {
  assert.ok(a.lines(width).every((line: string) => visibleWidth(line) <= width));
}
globalOpen = false;

// Failed summaries keep accurate call/failure counts and native output on expansion.
responseError = true;
await emit("message_start", { message: assistant([]) });
await emit("message_end", { message: assistant(["c"]) });
const c = makeRow("c", "bash", {});
await emit("tool_execution_end", {
  toolCallId: "c",
  toolName: "bash",
  result: { content: [{ type: "text", text: "exit code 1" }] },
  isError: true,
});
await emit("turn_end", { outcome: "completed" });
assert.match(c.lines().join("\n"), /1 failed/);
assert.match(c.lines().join("\n"), /summary unavailable/);
c.click();
assert.match(c.lines().join("\n"), /output c/);

const countBeforeAbort = requests;
await emit("message_start", { message: assistant([]) });
await emit("message_end", { message: assistant(["d"]) });
const d = makeRow("d", "read", {});
await emit("turn_end", { outcome: "aborted" });
await emit("agent_settled", { aborted: true });
assert.equal(requests, countBeforeAbort);
assert.match(d.lines().join("\n"), /stopped/);

// Restore only the active branch, including persisted display summaries.
branch = [
  { type: "message", message: assistant(["a", "b"]) },
  { type: "message", message: { role: "toolResult", toolCallId: "a", isError: false } },
  { type: "message", message: { role: "toolResult", toolCallId: "b", isError: false } },
  receipts[0],
];
await emit("session_tree");
const restored = makeRow("a", "read", {});
assert.match(restored.lines().join("\n"), /Read README.md and ran tests/);
assert.match(restored.lines().join("\n"), /2 calls/);
assert.equal(requests, countBeforeAbort);
// Exercise Pi's real tool-row shell and native renderers, not just fake slots.
const { initTheme } = await import(
  pathToFileURL(path.join(pkg, "dist/modes/interactive/theme/theme.js")).href
);
initTheme("dark", false);
const { ToolExecutionComponent } = await import(
  pathToFileURL(path.join(pkg, "dist/modes/interactive/components/tool-execution.js")).href
);
const { createReadToolDefinition, createBashToolDefinition } = await import(
  pathToFileURL(path.join(pkg, "dist/core/tools/index.js")).href
);
await emit("message_start", { message: assistant([]) });
await emit("message_end", { message: assistant(["native-read", "native-bash"]) });
const nativeUi = { requestRender() {} };
const read = new ToolExecutionComponent(
  "read",
  "native-read",
  { path: "README.md" },
  {},
  resolver("read", () => createReadToolDefinition(process.cwd())),
  nativeUi,
  process.cwd(),
);
const bash = new ToolExecutionComponent(
  "bash",
  "native-bash",
  { command: "pnpm test" },
  {},
  resolver("bash", () => createBashToolDefinition(process.cwd())),
  nativeUi,
  process.cwd(),
);
read.markExecutionStarted();
bash.markExecutionStarted();
read.updateResult({
  content: [{ type: "text", text: "README contents" }],
  details: undefined,
  isError: false,
  durationMs: 17,
});
bash.updateResult({
  content: [{ type: "text", text: "native test output" }],
  details: undefined,
  isError: false,
  durationMs: 30,
});
assert.deepEqual(
  bash.render(100),
  [],
  "Pi's self-render shell suppresses collapsed sibling spacing",
);
globalOpen = true;
read.setExpanded(true);
bash.setExpanded(true);
assert.match(bash.render(100).join("\n"), /native test output/);
globalOpen = false;
read.setExpanded(false);
bash.setExpanded(false);
assert.deepEqual(bash.render(100), []);

// A stale request must not append to a session after shutdown, even if its provider ignores abort.
responseError = false;
let release!: () => void;
replyGate = new Promise<void>((resolve) => {
  release = resolve;
});
const receiptCount = receipts.length;
const waiting = emit("turn_end", { outcome: "completed" });
await Promise.resolve();
await emit("session_shutdown");
assert.equal(capturedSignal!.aborted, true);
release();
await waiting;
assert.equal(receipts.length, receiptCount);
console.log(
  "tool-overview: evidence, validation, Pi loading, rendering, grouping, summaries, failures, modes, and restoration passed",
);
