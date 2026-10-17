import { test, expect } from "claude-code/testing";

// The engine beneath the plugin: a store in memory and one finished turn
// with one Write.
function engine(on, stored: Record<string, unknown> = {}) {
  const store = { ...stored };
  on("session.start", ($, e) => ({ cwd: e.cwd }));
  on("command.register", ($, e) => ({ value: { command: e.name } }));
  on("store.get", ($, e) => ({ value: store[e.key] ?? null }));
  on("store.set", ($, e) => {
    store[e.key] = e.value;
    return { value: undefined };
  });
  on("session.cwd", () => ({ value: "/work" }));
  on("fs.exists", () => ({ value: false }));
  on("tool.call", () => ({ result: { text: "ok" } }));
  on("turn.start", ($, e) => ({ turnId: e.turnId }));
  on("turn.complete", () => ({ text: "" }));
  // The engine's own band: an empty box.
  on("ui.render", ($, e) => $.ui.resolve(e).Box({}));
  return store;
}

async function oneEdit($) {
  await $.session.start({
    cwd: "/work",
    surface: "terminal",
    isInteractive: true,
  });
  await $.turn.start({ text: "edit", turnId: "t1" });
  await $.tool.call({
    tool: "Write",
    file_path: "/work/a.txt",
    content: "a\n",
  });
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
  });
}

test("the hint is hidden by default", async ($, on) => {
  engine(on);
  await oneEdit($);
  const ui = await $.ui.mount({
    plugin: "replay-theater",
    surface: "terminal",
    component: "AbovePrompt",
    props: {},
  });
  expect(await ui.find({ text: /Replay:/ })).toBeUndefined();
});

test("/replay hint toggles the hint and stores the choice", async ($, on) => {
  const store = engine(on);
  await oneEdit($);
  expect(
    await $.command.run({ command: "replay", args: "hint" }),
  ).toMatchObject({ text: "Replay Theater: hint on" });
  expect(store.showHint).toBe(true);
  const ui = await $.ui.mount({
    plugin: "replay-theater",
    surface: "terminal",
    component: "AbovePrompt",
    props: {},
  });
  expect(await ui.find({ text: /Replay: 1 edit/ })).toBeDefined();
  expect(
    await $.command.run({ command: "replay", args: "hint off" }),
  ).toMatchObject({ text: "Replay Theater: hint off" });
  expect(store.showHint).toBe(false);
});

test("a stored choice survives a new session", async ($, on) => {
  engine(on, { showHint: true });
  await oneEdit($);
  const ui = await $.ui.mount({
    plugin: "replay-theater",
    surface: "terminal",
    component: "AbovePrompt",
    props: {},
  });
  expect(await ui.find({ text: /Replay: 1 edit/ })).toBeDefined();
});
