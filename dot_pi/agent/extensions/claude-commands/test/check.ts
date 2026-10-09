/**
 * Self-check for ../index.ts.
 *
 * Run: node test/check.ts, from the extension directory, or `just pi-check`.
 *
 * Node strips the types, so this needs no build step and no dependency. The last
 * group runs against the real ~/.claude/commands, so it also reports whether the
 * installed tree still matches what the extension was written against.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire, registerHooks } from "node:module";
import { EventEmitter } from "node:events";
import claudeCommandsExtension, {
  commandName,
  describe,
  discover,
  expand,
  expandSpans,
  parseFile,
  substituteArgs,
  withInlineCommands,
  inlineCommandEditor,
} from "../index.ts";
import claudeRules from "../../claude-rules/index.ts";
import claudeProject from "../../claude-project/index.ts";
import claudeSkills from "../../claude-skills/index.ts";

let checks = 0;
async function check(
  what: string,
  run: () => void | Promise<void>,
): Promise<void> {
  checks += 1;
  try {
    await run();
  } catch (error) {
    console.error(
      `FAIL ${what}\n  ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

// ── Names ─────────────────────────────────────────────────────────────────────

await check("a nested file is named by its path", () => {
  assert.equal(
    commandName(path.join("git", "commit", "single.md")),
    "git:commit:single",
  );
});

await check("a root file keeps its basename", () => {
  assert.equal(commandName("chezmoi.md"), "chezmoi");
});

await check("the two cleanup.md files get distinct names", () => {
  assert.notEqual(
    commandName(path.join("git", "branches", "cleanup.md")),
    commandName(path.join("git", "worktrees", "cleanup.md")),
  );
});

await check("frontmatter name replaces the leaf, not the path", () => {
  assert.equal(
    commandName(path.join("issues", "improve-issue.md"), "renamed"),
    "issues:renamed",
  );
});

// ── Frontmatter ───────────────────────────────────────────────────────────────

await check("frontmatter keys and body are split", () => {
  const parsed = parseFile(
    "---\ndescription: Do a thing\nargument-hint: <task>\n---\n\nBody line.\n",
  );
  assert.equal(parsed.frontmatter.description, "Do a thing");
  assert.equal(parsed.frontmatter["argument-hint"], "<task>");
  assert.equal(parsed.body, "Body line.\n");
});

await check("a file with no frontmatter is all body", () => {
  assert.equal(parseFile("Just prose.\n").body, "Just prose.\n");
  assert.deepEqual(parseFile("Just prose.\n").frontmatter, {});
});

await check(
  "the argument hint leads the description, as pi renders a prompt template",
  () => {
    assert.equal(
      describe({ description: "Do a thing", argumentHint: "<task>" }),
      "<task> — Do a thing",
    );
    assert.equal(describe({ description: "Do a thing" }), "Do a thing");
    assert.equal(describe({ argumentHint: "<task>" }), "<task>");
    assert.equal(describe({}), undefined);
  },
);

await check("a file with no frontmatter falls back to its heading", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-commands-"));
  try {
    fs.writeFileSync(path.join(dir, "clean.md"), "# Refactor Clean\n\nBody.\n");
    assert.equal(discover(dir)[0]?.description, "Refactor Clean");
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

await check("a --- inside the body does not end the frontmatter early", () => {
  const parsed = parseFile(
    "---\ndescription: x\n---\n\nIntro\n\n---\n\nMore\n",
  );
  assert.equal(parsed.frontmatter.description, "x");
  assert.match(parsed.body, /More/);
});

// ── Arguments ─────────────────────────────────────────────────────────────────

await check("$ARGUMENTS takes everything typed", () => {
  const { text, consumed } = substituteArgs("Fix $ARGUMENTS now.", "issue 42");
  assert.equal(text, "Fix issue 42 now.");
  assert.equal(consumed, true);
});

await check("$N is 0-based, as Claude documents", () => {
  assert.equal(
    substituteArgs("$0 then $1", 'first "second word"').text,
    "first then second word",
  );
});

await check("$ARGUMENTS[N] matches its $N shorthand", () => {
  assert.equal(
    substituteArgs("$ARGUMENTS[1]", "a b").text,
    substituteArgs("$1", "a b").text,
  );
});

await check("an index with no argument stays literal", () => {
  const { text, consumed } = substituteArgs("$0 and $2", "only");
  assert.equal(text, "only and $2");
  assert.equal(consumed, true);
});

await check("a body that reads nothing does not count as consuming", () => {
  assert.equal(substituteArgs("No placeholder here.", "typed").consumed, false);
});

await check("\\$ escapes a placeholder", () => {
  assert.equal(
    substituteArgs(String.raw`costs \$1.00`, "arg").text,
    "costs $1.00",
  );
});

await check("a doubled backslash keeps both and still expands", () => {
  assert.equal(substituteArgs(String.raw`\\$0`, "x").text, String.raw`\\x`);
});

// ── Named arguments ───────────────────────────────────────────────────────────

await check("a flow list declares names in order", () => {
  assert.deepEqual(
    parseFile("---\narguments: [author, count]\n---\n\nx\n").argumentNames,
    ["author", "count"],
  );
});

await check("a block list declares the same names", () => {
  assert.deepEqual(
    parseFile("---\narguments:\n  - author\n  - count\n---\n\nx\n")
      .argumentNames,
    ["author", "count"],
  );
});

await check("a space-separated string declares the same names", () => {
  assert.deepEqual(
    parseFile("---\narguments: author count\n---\n\nx\n").argumentNames,
    ["author", "count"],
  );
});

await check("a file with no arguments: declares none", () => {
  assert.deepEqual(
    parseFile("---\ndescription: x\n---\n\nbody\n").argumentNames,
    [],
  );
});

await check("$name takes the argument at its position", () => {
  const { text } = substituteArgs(
    '--author="$author" HEAD~$count',
    '"A B <a@b.c>" 5',
    ["author", "count"],
  );
  assert.equal(text, '--author="A B <a@b.c>" HEAD~5');
});

await check("a name with no argument becomes empty and still counts", () => {
  const { text, consumed } = substituteArgs("HEAD~$count", "", [
    "author",
    "count",
  ]);
  assert.equal(text, "HEAD~");
  assert.equal(consumed, true);
});

await check("an undeclared name stays literal", () => {
  assert.equal(
    substituteArgs("$CURRENT_DATE and $NEW_DATE", "x", ["hours"]).text,
    "$CURRENT_DATE and $NEW_DATE",
  );
});

await check(
  "a name needs a word boundary, so -v$hoursH does not expand",
  () => {
    // This is why shift-dates.md writes -v"$hours"H rather than -v$hoursH.
    assert.equal(
      substituteArgs('-v$hoursH vs -v"$hours"H', "+2", ["hours"]).text,
      '-v$hoursH vs -v"+2"H',
    );
  },
);

await check("\\$name escapes a declared name", () => {
  assert.equal(
    substituteArgs(String.raw`\$author`, "A", ["author"]).text,
    "$author",
  );
});

// ── Spans ─────────────────────────────────────────────────────────────────────

const fakeExec =
  (stdout: string, code = 0) =>
  async () => ({ stdout, stderr: "", code });

await check("a span is replaced by its output", async () => {
  assert.equal(
    await expandSpans(
      "- Branch: !`git branch --show-current`",
      fakeExec("main\n"),
    ),
    "- Branch: main",
  );
});

await check("a span at the start of a line is found", async () => {
  assert.equal(
    await expandSpans("!`date`", fakeExec("2026-09-19")),
    "2026-09-19",
  );
});

await check("a span not preceded by whitespace stays literal", async () => {
  const text = "KEY=!`date`";
  assert.equal(await expandSpans(text, fakeExec("never")), text);
});

await check("a span inside a fenced block is sample text", async () => {
  const text = "Prose\n\n```\n- Branch: !`git branch`\n```\n";
  assert.equal(await expandSpans(text, fakeExec("never")), text);
});

await check("a failing span aborts the invocation", async () => {
  await assert.rejects(
    () => expandSpans("!`false`", fakeExec("", 1)),
    /exited 1/,
  );
});

await check(
  "arguments reach a span, because they are substituted first",
  () => {
    assert.equal(
      substituteArgs("!`gh issue view $ARGUMENTS`", "42").text,
      "!`gh issue view 42`",
    );
  },
);

// ── The installed tree ────────────────────────────────────────────────────────

const root = path.join(os.homedir(), ".claude", "commands");
const found = discover(root);

await check("commands are discovered", () => {
  assert.ok(found.length > 0, `no command files under ${root}`);
});

await check("every name is unique", () => {
  const names = found.map((command) => command.name);
  const duplicates = names.filter(
    (name, index) => names.indexOf(name) !== index,
  );
  assert.deepEqual(duplicates, [], `colliding names: ${duplicates.join(", ")}`);
});

await check("README.md is not a command", () => {
  assert.equal(
    found.filter((command) => command.name.endsWith("README")).length,
    0,
  );
});

await check("the previously colliding commands all survive", () => {
  const names = new Set(found.map((command) => command.name));
  for (const name of [
    "git:branches:cleanup",
    "git:worktrees:cleanup",
    "git:push",
    "git:commit:push",
    "git:commit:single",
  ]) {
    assert.ok(names.has(name), `missing /${name}`);
  }
});

await check(
  "every command carries a description, from frontmatter or the first heading",
  () => {
    const missing = found
      .filter((command) => !command.description)
      .map((command) => command.name);
    assert.deepEqual(missing, [], `no description: ${missing.join(", ")}`);
  },
);

// ── Display and delivery against the installed pi-tui ──────────────────────────

if (process.env.PI_PACKAGE) {
  const require = createRequire(path.join(process.env.PI_PACKAGE, "package.json"));
  const tuiPath = require.resolve("@earendil-works/pi-tui");
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "@earendil-works/pi-tui") {
        return nextResolve(tuiPath, context);
      }
      return nextResolve(specifier, context);
    },
  });
  const previous = process.env.PI_EXPAND_SLASH_COMMANDS;
  try {
    const { CombinedAutocompleteProvider, Editor } = await import(tuiPath);
    const provider = withInlineCommands(new CombinedAutocompleteProvider([
      { name: "git:commit:single", description: "Commit" },
    ], root));
    const options = { signal: new AbortController().signal };
    await check("slash completion preserves text on the first and later lines", async () => {
      for (const [lines, line, col] of [
        [["/git"], 0, 4],
        [["Please /git after"], 0, 11],
        [["First line", "/git after"], 1, 4],
        [["First line", "  then /git after"], 1, 11],
      ]) {
        const suggestions = await provider.getSuggestions(lines, line, col, options);
        assert.equal(suggestions.prefix, "/git");
        assert.equal(suggestions.items[0].value, "git:commit:single");
        const result = provider.applyCompletion(lines, line, col, suggestions.items[0], suggestions.prefix);
        assert.equal(result.lines[line], lines[line].slice(0, col - 4) + "/git:commit:single " + lines[line].slice(col));
        assert.equal(result.cursorCol, col - 4 + "/git:commit:single ".length);
        if (line) assert.equal(result.lines[0], lines[0]);
      }
    });
    await check("typing slash triggers the editor provider after text and newlines", async () => {
      const InlineEditor = inlineCommandEditor(Editor);
      const editor = new InlineEditor({ requestRender() {} }, {
        borderColor: (text) => text,
        selectList: { selectedPrefix: (text) => text, selectedText: (text) => text,
          description: (text) => text, scrollInfo: (text) => text, noMatch: (text) => text },
      });
      let calls = 0;
      editor.setAutocompleteProvider({ ...provider, async getSuggestions(...args) {
        calls++;
        return provider.getSuggestions(...args);
      } });
      for (const text of ["Please ", "First line\n"]) {
        editor.setText(text);
        const before = calls;
        editor.handleInput("/");
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert.ok(calls > before, `no completion request after ${JSON.stringify(text)}`);
        editor.handleInput("g");
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.ok(editor.isShowingAutocomplete());
        editor.handleInput("\t");
        assert.equal(editor.getText(), text + "/git:commit:single ");
        editor.handleInput("\x1b");
      }
    });
    await check("file and argument completion delegate unchanged", async () => {
      const calls = [];
      const fallback = {
        triggerCharacters: ["@", "#"],
        async getSuggestions(...args) { calls.push(args); return null; },
        applyCompletion(...args) { calls.push(args); return "unchanged"; },
        shouldTriggerFileCompletion() { return true; },
      };
      const wrapped = withInlineCommands(fallback);
      assert.deepEqual(wrapped.triggerCharacters, ["@", "#"]);
      for (const text of ["https://git", "word/git", "See /tmp/file", "@file", "/git argument"]) {
        const lines = [text];
        await wrapped.getSuggestions(lines, 0, text.length, options);
        assert.equal(calls.at(-1)[0], lines);
      }
      const lines = ["See /tmp"];
      await wrapped.getSuggestions(lines, 0, 8, { ...options, force: true });
      assert.equal(calls.at(-1)[0], lines);
      assert.equal(wrapped.applyCompletion(lines, 0, 8, { value: "/tmp/file", label: "file" }, "/tmp"), "unchanged");
      assert.equal(wrapped.shouldTriggerFileCompletion(lines, 0, 8), true);
    });
    const commands = new Map();
    const handlers = new Map();
    const events = new EventEmitter();
    let renderer;
    const messages = [];
    const notifications = [];
    let failExec = false;
    await claudeCommandsExtension({
      events,
      registerMessageRenderer(type, render) {
        assert.equal(type, "claude-command");
        renderer = render;
      },
      on(name, handler) { handlers.set(name, handler); },
      registerCommand(name, command) { commands.set(name, command); },
      exec: async () => ({ stdout: "context", stderr: "", code: failExec ? 1 : 0 }),
      sendMessage(message, options) { messages.push({ message, options }); },
    });
    const ctx = { cwd: root, ui: { notify: (...args) => notifications.push(args) } };
    const command = found[0];
    const expected = await expand(command.filePath, "42", fakeExec("context"));

    await check("project commands, rules and skills load from the session cwd", async () => {
      const project = fs.mkdtempSync(path.join(os.tmpdir(), "pi-claude-project-"));
      const previousArgv = [...process.argv];
      try {
        const local = path.join(project, ".claude");
        for (const kind of ["commands", "rules", "skills"]) fs.mkdirSync(path.join(local, kind), { recursive: true });
        fs.writeFileSync(path.join(local, "commands", "override.md"), `---\nname: ${command.name}\n---\nProject command $ARGUMENTS`);
        fs.writeFileSync(path.join(local, "rules", "code.md"), "Project instructions");
        fs.writeFileSync(path.join(local, "rules", "scoped.md"), "---\npaths: src/**\n---\nProject scoped instructions");
        process.argv.push("--approve");
        const localCtx = { ...ctx, cwd: project, mode: "print", sessionManager: { getBranch: () => [] } };
        const ruleHandlers = new Map();
        const projectHandlers = new Map();
        const skillHandlers = new Map();
        claudeProject({ events, on(name, handler) { projectHandlers.set(name, handler); } });
        claudeSkills({ events, on(name, handler) { skillHandlers.set(name, handler); } });
        claudeRules({ events, on(name, handler) { ruleHandlers.set(name, handler); }, sendMessage(message) { messages.push({ message }); } });
        await projectHandlers.get("session_start")({}, localCtx);
        await handlers.get("session_start")({}, localCtx);
        await commands.get(command.name).handler("42", localCtx);
        assert.equal(messages.at(-1).message.content, "Project command 42");
        assert.equal(handlers.has("resources_discover"), false);
        assert.deepEqual(await skillHandlers.get("resources_discover")({}, localCtx), { skillPaths: [path.join(local, "skills")] });
        await ruleHandlers.get("session_start")({}, localCtx);
        const prompt = ruleHandlers.get("before_agent_start")({ systemPrompt: "base" }).systemPrompt;
        assert.ok(prompt.includes("# Rules from ~/.claude/rules"));
        assert.ok(prompt.includes(`Rules from ${local}/rules\n\nProject instructions`));
        assert.ok(!prompt.includes("Project scoped instructions"));
        const result = { toolName: "read", input: { path: "src/file.ts" }, isError: false };
        const count = messages.length;
        ruleHandlers.get("tool_result")(result, localCtx);
        assert.equal(messages.length, count + 1);
        const scoped = messages.at(-1).message;
        assert.equal(scoped.details.name, path.join(local, "rules", "scoped.md"));
        ruleHandlers.get("tool_result")(result, localCtx);
        assert.equal(messages.length, count + 1);
        await ruleHandlers.get("session_start")({}, { ...localCtx, sessionManager: { getBranch: () => [{ type: "custom_message", ...scoped }] } });
        ruleHandlers.get("tool_result")(result, localCtx);
        assert.equal(messages.length, count + 1);
        const denied = path.join(project, "denied");
        fs.mkdirSync(path.join(denied, ".claude", "rules"), { recursive: true });
        fs.writeFileSync(path.join(denied, ".claude", "rules", "local.md"), "Do not load");
        process.argv = [...previousArgv, "--no-approve"];
        const deniedCtx = { ...localCtx, cwd: denied };
        await projectHandlers.get("session_start")({}, deniedCtx);
        await handlers.get("session_start")({}, deniedCtx);
        assert.equal(await skillHandlers.get("resources_discover")({}, deniedCtx), undefined);
        await ruleHandlers.get("session_start")({}, deniedCtx);
        assert.ok(!ruleHandlers.get("before_agent_start")({ systemPrompt: "base" }).systemPrompt.includes("Do not load"));
      } finally {
        process.argv = previousArgv;
        fs.rmSync(project, { recursive: true, force: true });
        // Restore the global command used by the delivery checks below.
        await claudeCommandsExtension({
          events,
          registerMessageRenderer() {}, on() {},
          registerCommand(name, command) { commands.set(name, command); },
          exec: async () => ({ stdout: "context", stderr: "", code: failExec ? 1 : 0 }),
          sendMessage(message, options) { messages.push({ message, options }); },
        });
      }
    });

    await check("display modes send identical expanded user-role context", async () => {
      for (const value of [undefined, "0", "1", "true"]) {
        if (value === undefined) delete process.env.PI_EXPAND_SLASH_COMMANDS;
        else process.env.PI_EXPAND_SLASH_COMMANDS = value;
        await commands.get(command.name).handler("42", ctx);
        const { message, options } = messages.at(-1);
        assert.equal(message.content, expected);
        assert.equal(message.details.invocation, `/${command.name} 42`);
        assert.equal(message.display, true);
        assert.deepEqual(options, { triggerTurn: true });
        const component = renderer(message, { expanded: false, outputPad: 1 }, {
          fg: (_color, text) => text,
        });
        if (value === "1") assert.equal(component, undefined);
        else assert.equal(component.render(80).join("\n").trim(), `/${command.name} 42`);
        assert.equal(renderer(message, { expanded: true, outputPad: 1 }, {}), undefined);
      }
    });

    await check("an invocation without arguments has no trailing space", async () => {
      await commands.get(command.name).handler("", ctx);
      assert.equal(messages.at(-1).message.details.invocation, `/${command.name}`);
    });

    await check("failed dynamic context sends no message", async () => {
      const dynamic = found.find((file) => /(^|\s)!`/.test(parseFile(fs.readFileSync(file.filePath, "utf-8")).body));
      assert.ok(dynamic, "no installed command uses dynamic context");
      const count = messages.length;
      failExec = true;
      await commands.get(dynamic.name).handler("42", ctx);
      assert.equal(messages.length, count);
      assert.equal(notifications.at(-1)[1], "error");
    });
  } finally {
    hooks.deregister();
    if (previous === undefined) delete process.env.PI_EXPAND_SLASH_COMMANDS;
    else process.env.PI_EXPAND_SLASH_COMMANDS = previous;
  }
} else {
  console.log("PI_PACKAGE unset, skipping display and delivery checks");
}

console.log(
  `${checks} checks, ${found.length} commands discovered under ${root}`,
);
if (process.exitCode) {
  console.error("FAILED");
}
