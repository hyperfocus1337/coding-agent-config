/** Run with just pi-check. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { rankCommands, readUsage, recordUsage, trackSubmissions } from "../usage.ts";

assert.ok(process.env.PI_PACKAGE, "Run just pi-check");
const { CombinedAutocompleteProvider } = await import(
  pathToFileURL(path.join(path.dirname(process.env.PI_PACKAGE), "pi-tui/dist/autocomplete.js")).href
);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "pi-slash-usage-"));
try {
  const file = path.join(temporary, "data", "usage.jsonl");
  assert.equal(readUsage(file).size, 0);
  recordUsage(file, "hello /alpha");
  recordUsage(file, "/");
  assert.equal(fs.existsSync(file), false);
  recordUsage(file, "/zeta private argument", 10);
  recordUsage(file, "/alpha", 20);
  recordUsage(file, "/zeta", 1);
  recordUsage(file, "\n /beta\nsecret prompt", 30);
  assert.deepEqual(readUsage(file).get("zeta"), { count: 2, last: 10 });
  assert.ok(!fs.readFileSync(file, "utf8").includes("private"));
  assert.ok(!fs.readFileSync(file, "utf8").includes("secret"));
  fs.appendFileSync(file, '\n["partial"');
  recordUsage(file, "/beta", 40);
  fs.appendFileSync(file, '\nnull\n{}\n["bad/name",1]\n["bad",-1]\n["bad","1"]\n');
  assert.equal(readUsage(file).size, 3);
  const native = new CombinedAutocompleteProvider(
    [
      { name: "alpha" },
      { name: "beta" },
      { name: "zeta" },
      { name: "unused" },
      { name: "args", getArgumentCompletions: () => [{ value: "yes", label: "yes" }] },
    ],
    temporary,
  );
  const provider = rankCommands(native, () => readUsage(file));
  const get = (target: typeof provider, text: string) =>
    target.getSuggestions([text], 0, text.length, { signal: new AbortController().signal });
  const before = await get(native, "/");
  const result = await get(provider, "/");
  assert.deepEqual(
    result.items.slice(0, 3).map((item: { value: string }) => item.value),
    ["beta", "zeta", "alpha"],
  );
  assert.deepEqual(await get(native, "/"), before, "Do not mutate native suggestions");
  for (const text of ["/a", "/args ", "@", "plain"]) {
    assert.deepEqual(await get(provider, text), await get(native, text), text);
  }
  const item = result.items[0];
  assert.deepEqual(
    provider.applyCompletion(["/"], 0, 1, item, "/"),
    native.applyCompletion(["/"], 0, 1, item, "/"),
  );
  recordUsage(file, "/alpha", 50);
  recordUsage(file, "/alpha", 51);
  assert.equal((await get(provider, "/")).items[0].value, "alpha", "Read other sessions' updates");

  const submitted: string[] = [];
  const recorded: string[] = [];
  const editor = { onSubmit: undefined };
  trackSubmissions(editor as any, (text) => recorded.push(text));
  (editor as any).onSubmit = (text: string) => submitted.push(text);
  (editor as any).onSubmit("/alpha");
  (editor as any).onSubmit = (text: string) => submitted.push(`new:${text}`);
  (editor as any).onSubmit("/beta");
  assert.deepEqual(recorded, ["/alpha", "/beta"]);
  assert.deepEqual(submitted, ["/alpha", "new:/beta"]);
  assert.throws(() => readUsage(temporary));
  assert.throws(() => recordUsage(path.join(file, "blocked"), "/alpha"));
  const { loadExtensions } = await import(
    pathToFileURL(path.join(process.env.PI_PACKAGE, "dist/core/extensions/loader.js")).href
  );
  const loaded = await loadExtensions(
    [path.resolve(import.meta.dirname, "../index.ts")],
    temporary,
  );
  assert.deepEqual(loaded.errors, []);
  const start = loaded.extensions[0].handlers.get("session_start")[0];
  await start({}, { mode: "print" });
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = path.join(temporary, "agent");
  try {
    let factory: any;
    let wrap: any;
    let created = 0;
    const notices: string[] = [];
    const context = {
      mode: "tui",
      ui: {
        getEditorComponent: () => () => {
          created++;
          return { marker: true };
        },
        setEditorComponent: (value: any) => {
          factory = value;
        },
        addAutocompleteProvider: (value: any) => {
          wrap = value;
        },
        notify: (message: string) => notices.push(message),
      },
    };
    await start({}, context);
    const liveEditor = factory();
    assert.equal(created, 1);
    assert.equal(liveEditor.marker, true, "Keep the existing editor");
    let calls = 0;
    liveEditor.onSubmit = () => {
      calls++;
    };
    liveEditor.onSubmit("/zeta secret");
    assert.equal(calls, 1);
    assert.equal((await get(wrap(native), "/")).items[0].value, "zeta");
    assert.deepEqual(notices, []);
    // A storage failure must warn once, and still forward each submission.
    const data = path.join(process.env.PI_CODING_AGENT_DIR, "data");
    fs.renameSync(data, `${data}-saved`);
    fs.writeFileSync(data, "blocked");
    liveEditor.onSubmit("/alpha");
    liveEditor.onSubmit("/beta");
    assert.equal(calls, 3);
    assert.equal(notices.length, 1);
    assert.deepEqual(await get(wrap(native), "/"), before);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
  }
  console.log(
    "slash-usage: storage, ranking, native completion, editor composition, and Pi loading checks passed",
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
