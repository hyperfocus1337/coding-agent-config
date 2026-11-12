/** Run with PI_PACKAGE set to the installed Pi package, or use just pi-check. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { extendSearch, extraRoots, searchRoots, within } from "../search.ts";

const piPackage = process.env.PI_PACKAGE;
assert.ok(piPackage, "Set PI_PACKAGE or run just pi-check");
const { CombinedAutocompleteProvider } = await import(
  pathToFileURL(path.join(path.dirname(piPackage), "pi-tui/dist/autocomplete.js")).href
);
// index.ts resolves the session cwd; macOS links the temporary folder from /var to /private/var.
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pi-file-search-")));
let checks = 0;
async function check(name: string, run: () => unknown): Promise<void> {
  try {
    await run();
    checks += 1;
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
try {
  const root = path.join(temporary, "repository with spaces ");
  const cwd = path.join(root, "src");
  const extra = path.join(temporary, "external");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(extra);
  execFileSync("git", ["init", "--quiet", root]);
  const write = (file: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "fixture\n");
  };
  for (const file of [
    "design.md",
    "nested/design.md",
    "design notes.md",
    "设计说明.md",
    "src/design.md-copy",
    "src/main.tf",
    "ignored-design.md",
    ".git/secret-design.md",
  ]) {
    write(path.join(root, file));
  }
  write(path.join(extra, "design.md"));
  fs.writeFileSync(path.join(root, ".gitignore"), "ignored-design.md\n");
  fs.symlinkSync(path.join(extra, "design.md"), path.join(root, "escaped-design.md"));
  const native = (base: string) =>
    new CombinedAutocompleteProvider([{ name: "hello", description: "test command" }], base, "fd");
  const current = native(cwd);
  const sources = [root, extra, path.join(root, "nested")].map((directory) => ({
    root: directory,
    provider: native(directory),
  }));
  const provider = extendSearch(current, cwd, sources);
  const get = (text: string, target = provider, signal = new AbortController().signal) =>
    target.getSuggestions([text], 0, text.length, { signal });
  const find = async (text: string, description: string) => {
    const result = await get(text);
    assert.ok(result, `No completion for ${text}`);
    const item = result.items.find((item) => item.description === description);
    assert.ok(item, `Missing ${description}: ${JSON.stringify(result)}`);
    return { result, item };
  };

  await check("repository files appear from a nested cwd", async () => {
    const { result, item } = await find("review @design", "../design.md");
    assert.equal(result.prefix, "@design");
    const completed = provider.applyCompletion(["review @design"], 0, 14, item, result.prefix);
    assert.equal(completed.lines[0], "review @../design.md ");
  });
  await check("repository exact matches rank above local prefix matches", async () => {
    const result = await get("@design.md");
    assert.equal(result.items[0].description, "../design.md");
  });
  await check(
    "duplicate names keep distinct paths, overlapping roots do not duplicate targets",
    async () => {
      const result = await get("@design");
      assert.equal(result.items.filter((item) => item.label === "design.md").length, 3);
      assert.equal(
        result.items.filter((item) => item.description === "../nested/design.md").length,
        1,
      );
      assert.equal(result.items.filter((item) => item.label === "design.md-copy").length, 1);
    },
  );
  await check("external files use absolute paths outside home", async () => {
    const { item } = await find("@design", path.join(extra, "design.md"));
    assert.equal(item.value, `@${path.join(extra, "design.md")}`);
  });
  await check("external paths use ~/ when the target is under home", async () => {
    const savedHome = process.env.HOME;
    process.env.HOME = temporary;
    try {
      const { item } = await find("@design", "~/external/design.md");
      assert.equal(item.value, "@~/external/design.md");
    } finally {
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
    }
  });
  await check("rebasing quotes punctuation in an external root path", async () => {
    const punctuationRoot = path.join(temporary, "external，docs");
    write(path.join(punctuationRoot, "punctuation.md"));
    const extended = extendSearch(current, cwd, [
      { root: punctuationRoot, provider: native(punctuationRoot) },
    ]);
    const result = await get("@punctuation", extended);
    assert.equal(result.items[0].value, `@"${path.join(punctuationRoot, "punctuation.md")}"`);
  });
  await check("spaces and quoted queries retain native quoting", async () => {
    const { item } = await find('@"design n', "../design notes.md");
    assert.equal(item.value, '@"../design notes.md"');
    const text = 'read @"design n" next';
    const completed = provider.applyCompletion([text], 0, 15, item, '@"design n');
    assert.equal(completed.lines[0], 'read @"../design notes.md"  next');
  });
  await check("Unicode filenames work", async () => {
    await find("@设计", "../设计说明.md");
  });
  await check("native ignore rules and .git exclusions remain active", async () => {
    const result = await get("@design");
    assert.ok(!result.items.some((item) => /ignored|secret/.test(item.value)));
  });
  await check("additional-root symlinks cannot escape their search root", async () => {
    assert.equal(await get("@escaped"), null);
  });
  await check("commands, ordinary paths, and explicit @ paths keep native results", async () => {
    for (const text of [
      "/hel",
      "main",
      "@../design",
      "@../../missing/",
      `@${root}/design`,
      "@~/missing-pi-file-search-folder/",
    ]) {
      assert.deepEqual(await get(text), await get(text, current), text);
    }
  });
  await check("directories remain navigable without a trailing space", async () => {
    const { result, item } = await find("@nested", "../nested");
    const completed = provider.applyCompletion(["@nested"], 0, 7, item, result.prefix);
    assert.equal(completed.lines[0], "@../nested/");
  });
  await check("cancelled searches return no stale completions", async () => {
    const controller = new AbortController();
    const pending = get("@design", provider, controller.signal);
    controller.abort();
    assert.equal(await pending, null);
  });
  await check("a failing extra provider preserves local completion", async () => {
    const broken = extendSearch(current, cwd, [
      {
        root,
        provider: {
          getSuggestions: async () => {
            throw new Error("unavailable");
          },
          applyCompletion: current.applyCompletion.bind(current),
        },
      },
    ]);
    assert.deepEqual(await get("@main", broken), await get("@main", current));
  });
  await check("result count stays bounded", async () => {
    for (let i = 0; i < 30; i++) write(path.join(root, `bounded-${i}.md`));
    assert.equal((await get("@bounded")).items.length, 20);
  });
  await check("extra folder validation rejects malformed and relative paths", () => {
    assert.deepEqual(extraRoots({}), []);
    assert.deepEqual(extraRoots({ extraRoots: ["~/docs", extra] }), [
      path.join(os.homedir(), "docs"),
      extra,
    ]);
    for (const bad of [
      null,
      [],
      { extraRoots: null },
      { extraRoots: "bad" },
      { extraRoots: [1] },
      { extraRoots: ["../docs"] },
      { extraRoots: ["/bad\npath"] },
      { extraRoots: ['/bad"path'] },
    ]) {
      assert.throws(() => extraRoots(bad));
    }
  });
  await check("root discovery deduplicates aliases and reports unavailable folders", () => {
    fs.symlinkSync(root, path.join(temporary, "alias"));
    const warnings: string[] = [];
    assert.deepEqual(
      searchRoots(
        cwd,
        [
          cwd,
          root,
          root,
          path.join(temporary, "alias"),
          path.join(root, "design.md"),
          path.join(temporary, "missing"),
        ],
        (message) => warnings.push(message),
      ),
      [root],
    );
    assert.equal(warnings.length, 2);
    assert.ok(within(root, cwd));
    assert.ok(!within(root, `${root}-other`));
  });
  await check("no additional root leaves native completion unchanged", async () => {
    assert.deepEqual(
      await get("@main", extendSearch(current, cwd, [])),
      await get("@main", current),
    );
  });
  await check("Pi loads the extension and registers completion only in TUI mode", async () => {
    const { loadExtensions } = await import(
      pathToFileURL(path.join(piPackage, "dist/core/extensions/loader.js")).href
    );
    const savedDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = path.join(temporary, "agent");
    try {
      const extensionDir = path.join(temporary, "extension");
      fs.mkdirSync(extensionDir);
      for (const file of ["index.ts", "search.ts"]) {
        fs.copyFileSync(
          path.resolve(import.meta.dirname, "..", file),
          path.join(extensionDir, file),
        );
      }
      const configPath = path.join(extensionDir, "config.json");
      const loaded = await loadExtensions([path.join(extensionDir, "index.ts")], cwd);
      assert.deepEqual(loaded.errors, []);
      const start = loaded.extensions[0].handlers.get("session_start")[0];
      const wrappers: ((current: unknown) => unknown)[] = [];
      const warnings: string[] = [];
      const context = {
        cwd,
        mode: "tui",
        ui: {
          addAutocompleteProvider: (factory) => wrappers.push(factory),
          notify: (message) => warnings.push(message),
        },
      };
      await start({}, { ...context, mode: "print" });
      assert.equal(wrappers.length, 0);
      await start({}, context);
      assert.equal(wrappers.length, 1);
      assert.deepEqual(warnings, []);
      const live = wrappers[0](current);
      assert.ok((await get("@design", live)).items.some((item) => item.label === "../design.md"));
      await check("long filenames use the full menu width without duplicate columns", async () => {
        const filename = "long-project-implementation-design-document.md";
        write(path.join(root, filename));
        const result = await get("@long", live);
        const item = result.items.find((item) => item.label === `../${filename}`);
        assert.ok(item);
        assert.equal(item.description, undefined);
        const { SelectList } = await import(
          pathToFileURL(path.join(path.dirname(piPackage), "pi-tui/dist/components/select-list.js"))
            .href
        );
        const identity = (text: string) => text;
        const menu = new SelectList([item], 5, {
          selectedPrefix: identity,
          selectedText: identity,
          description: identity,
          scrollInfo: identity,
          noMatch: identity,
        });
        assert.equal(menu.render(100)[0], `→ ../${filename}`);
        const { visibleWidth } = await import(
          pathToFileURL(path.join(path.dirname(piPackage), "pi-tui/dist/utils.js")).href
        );
        assert.ok(visibleWidth(menu.render(30)[0]) <= 30);
        assert.equal(
          live.applyCompletion(["@long"], 0, 5, item, result.prefix).lines[0],
          `@../${filename} `,
        );
      });
      await check("single-column directory labels keep native navigation", async () => {
        const result = await get("@nested", live);
        const item = result.items.find((item) => item.label === "../nested/");
        assert.ok(item);
        assert.equal(
          live.applyCompletion(["@nested"], 0, 7, item, result.prefix).lines[0],
          "@../nested/",
        );
      });
      await check("menu formatting preserves commands and explicit-path insertion", async () => {
        assert.deepEqual(await get("/hel", live), await get("/hel", current));
        const text = "@../design";
        const original = await get(text, current);
        const formatted = await get(text, live);
        assert.deepEqual(
          formatted.items.map((item) => item.value),
          original.items.map((item) => item.value),
        );
        for (let i = 0; i < original.items.length; i++) {
          assert.deepEqual(
            live.applyCompletion([text], 0, text.length, formatted.items[i], formatted.prefix),
            current.applyCompletion([text], 0, text.length, original.items[i], original.prefix),
          );
        }
      });
      fs.writeFileSync(configPath, '{"extraRoots":["relative"]}');
      await start({}, context);
      assert.equal(
        wrappers.length,
        2,
        "invalid extra folders must not disable Git-root completion",
      );
      assert.equal(warnings.length, 1);
      await check("configured extra folders are searched", async () => {
        fs.writeFileSync(configPath, JSON.stringify({ extraRoots: [extra] }));
        await start({}, context);
        const result = await get("@design", wrappers.at(-1)(current));
        assert.ok(result.items.some((item) => item.label === "../design.md"));
        assert.ok(result.items.some((item) => item.label === path.join(extra, "design.md")));
      });
      await check("shipped adjacent configuration enables Git-root search", async () => {
        fs.copyFileSync(path.resolve(import.meta.dirname, "../config.json"), configPath);
        await start({}, context);
        assert.ok(
          (await get("@design", wrappers.at(-1)(current))).items.some(
            (item) => item.label === "../design.md",
          ),
        );
      });
    } finally {
      if (savedDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = savedDir;
    }
  });
  console.log(
    `${checks} checks: native search, rebasing, ranking, scope, validation, cancellation, and Pi loading`,
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
