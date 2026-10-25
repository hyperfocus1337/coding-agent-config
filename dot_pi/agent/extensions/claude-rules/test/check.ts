/**
 * Self-check for ../index.ts.
 *
 * Run: node test/check.ts, from the extension directory, or `just pi-check`.
 *
 * The glob group is Claude's own table from https://code.claude.com/docs/en/memory,
 * so a change in `matches` that departs from it fails here first. The last group runs
 * against the real ~/.claude/rules.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import claudeRules, {
  discover,
  matches,
  patterns,
  instructionFiles,
  type Rule,
} from "../index.ts";

let checks = 0;
function check(what: string, run: () => void): void {
  checks += 1;
  try {
    run();
  } catch (error) {
    console.error(
      `FAIL ${what}\n  ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

const rule = (...paths: string[]): Rule => ({
  name: "r.md",
  filePath: "/r.md",
  paths,
  body: "",
});

// ── Frontmatter ───────────────────────────────────────────────────────────────

check("a block list of quoted globs parses", () => {
  assert.deepEqual(patterns('"dot_claude/**" "dot_config/**"'), [
    "dot_claude/**",
    "dot_config/**",
  ]);
});

check("a flow list parses", () => {
  assert.deepEqual(patterns('["src/**/*.ts", lib/**]'), [
    "src/**/*.ts",
    "lib/**",
  ]);
});

check("no paths: means unscoped", () => {
  assert.deepEqual(patterns(undefined), []);
});

// ── Globs, Claude's table ─────────────────────────────────────────────────────

check("**/*.ts matches a TypeScript file in any directory", () => {
  assert.equal(matches(rule("**/*.ts"), "src/a/b.ts"), true);
  assert.equal(matches(rule("**/*.ts"), "a.ts"), true);
});

check("src/**/* matches everything under src", () => {
  assert.equal(matches(rule("src/**/*"), "src/a/b.ts"), true);
  assert.equal(matches(rule("src/**/*"), "lib/b.ts"), false);
});

check("*.md matches the project root only", () => {
  assert.equal(matches(rule("*.md"), "README.md"), true);
  assert.equal(matches(rule("*.md"), "docs/README.md"), false);
});

check("src/components/*.tsx matches one directory", () => {
  assert.equal(
    matches(rule("src/components/*.tsx"), "src/components/App.tsx"),
    true,
  );
  assert.equal(
    matches(rule("src/components/*.tsx"), "src/components/x/App.tsx"),
    false,
  );
});

check("braces expand", () => {
  assert.equal(matches(rule("src/**/*.{ts,tsx}"), "src/a.tsx"), true);
});

check("a trailing slash stands for the directory's contents", () => {
  assert.equal(matches(rule("src/"), "src/a/b.ts"), true);
});

check("a file outside the project matches nothing", () => {
  assert.equal(matches(rule("**"), "../elsewhere/a.ts"), false);
  assert.equal(matches(rule("**"), "/etc/passwd"), false);
});

check("any glob in the list is enough", () => {
  assert.equal(matches(rule("lib/**", "src/**"), "src/a.ts"), true);
});

// ── Discovery ─────────────────────────────────────────────────────────────────

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "claude-rules-"));
fs.mkdirSync(path.join(fixture, "nested"));
fs.writeFileSync(path.join(fixture, "README.md"), "# not a rule\n");
fs.writeFileSync(path.join(fixture, "b.md"), "### B\n\nbody b\n");
fs.writeFileSync(
  path.join(fixture, "nested", "a.md"),
  '---\npaths:\n  - "src/**"\n---\n\n### A\n\nbody a\n',
);

check("discover walks nested directories, skips README.md and sorts", () => {
  assert.deepEqual(
    discover(fixture).map((found) => found.name),
    ["b.md", path.join("nested", "a.md")],
  );
});

check("a missing root is no rules, not an error", () => {
  assert.deepEqual(discover(path.join(fixture, "absent")), []);
});

check("instruction files keep unscoped paths and bodies and are stable", () => {
  const found = discover(fixture);
  assert.deepEqual(instructionFiles(found), [
    { path: path.join(fixture, "b.md"), content: "### B\n\nbody b" },
  ]);
  assert.deepEqual(
    instructionFiles(found),
    instructionFiles(discover(fixture)),
  );
});

check("no unscoped rule means no instruction files", () => {
  assert.deepEqual(instructionFiles([rule("src/**")]), []);
});

check("the handler preserves native files and adds project rules once", () => {
  const handlers = new Map();
  let approved;
  claudeRules({
    on(name, handler) {
      handlers.set(name, handler);
    },
    events: {
      on(name, handler) {
        assert.equal(name, "claude-project");
        approved = handler;
      },
    },
  });
  const local = path.join(fixture, ".claude");
  fs.mkdirSync(path.join(local, "rules"), { recursive: true });
  fs.writeFileSync(path.join(local, "rules", "b.md"), "Project instructions");
  fs.writeFileSync(
    path.join(local, "rules", "scoped.md"),
    "---\npaths: src/**\n---\nScoped instructions",
  );
  handlers.get("session_start")(
    {},
    { sessionManager: { getBranch: () => [] } },
  );
  approved(local);
  const native = { path: "/project/AGENTS.md", content: "Native instructions" };
  const event = { systemPromptOptions: { contextFiles: [native] } };
  assert.equal(handlers.get("before_agent_start")(event), undefined);
  assert.equal(event.systemPromptOptions.contextFiles[0], native);
  assert.ok(
    event.systemPromptOptions.contextFiles.some(
      (file) =>
        file.path === path.join(local, "rules", "b.md") &&
        file.content === "Project instructions",
    ),
  );
  assert.ok(
    !event.systemPromptOptions.contextFiles.some(
      (file) => file.content === "Scoped instructions",
    ),
  );
  const count = event.systemPromptOptions.contextFiles.length;
  handlers.get("before_agent_start")(event);
  assert.equal(event.systemPromptOptions.contextFiles.length, count);
  approved(undefined);
  const denied = { systemPromptOptions: { contextFiles: [native] } };
  handlers.get("before_agent_start")(denied);
  assert.ok(
    !denied.systemPromptOptions.contextFiles.some((file) =>
      file.path.startsWith(local),
    ),
  );
});

fs.rmSync(fixture, { recursive: true });

// ── The installed tree ────────────────────────────────────────────────────────

const root = path.join(os.homedir(), ".claude", "rules");
const found = discover(root);

check("every installed rule is unscoped", () => {
  assert.deepEqual(
    found.filter((candidate) => candidate.paths.length > 0),
    [],
  );
});

check("the three unscoped rules retain their paths and full bodies", () => {
  const files = instructionFiles(found);
  for (const name of ["code.md", "tools.md", "writing.md"]) {
    const body = fs.readFileSync(path.join(root, name), "utf-8").trimEnd();
    assert.deepEqual(
      files.find((file) => file.path === path.join(root, name)),
      {
        path: path.join(root, name),
        content: body,
      },
    );
  }
});

// Verify the native renderer and the installed context viewer, without a model call.
if (process.env.PI_PACKAGE) {
  const { buildSystemPrompt } = await import(
    pathToFileURL(
      path.join(process.env.PI_PACKAGE, "dist/core/system-prompt.js"),
    ).href
  );
  const files = [
    { path: "/project/AGENTS.md", content: "Native instructions" },
    ...instructionFiles(found),
    {
      path: "/project/.claude/rules/local.md",
      content: "Project instructions",
    },
  ];
  const options = { cwd: "/project", contextFiles: files };
  const prompt = buildSystemPrompt(options);
  check("pi renders each rule as a native instruction-file record", () => {
    for (const file of files) {
      assert.ok(
        prompt.includes(
          `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>`,
        ),
      );
    }
    assert.ok(!prompt.includes("# Rules from"));
  });
  const viewer = path.join(
    os.homedir(),
    ".pi/agent/npm/node_modules/pi-context-view/src/measure.ts",
  );
  if (fs.existsSync(viewer)) {
    // Node does not strip TypeScript in node_modules. Limit this hook to the viewer.
    const prefix = pathToFileURL(path.dirname(viewer)).href + "/";
    const hooks = registerHooks({
      load(url, context, nextLoad) {
        if (url.startsWith(prefix) && url.endsWith(".ts")) {
          return {
            format: "module",
            source: stripTypeScriptTypes(
              fs.readFileSync(fileURLToPath(url), "utf-8"),
            ),
            shortCircuit: true,
          };
        }
        return nextLoad(url, context);
      },
    });
    let analyzeSystemPrompt;
    try {
      ({ analyzeSystemPrompt } = await import(pathToFileURL(viewer).href));
    } finally {
      hooks.deregister();
    }
    const items = analyzeSystemPrompt(prompt, {
      cwd: options.cwd,
      contextFilePaths: files.map((file) => file.path),
    });
    check(
      "pi-context-view classifies all rule records as Instruction Files",
      () => {
        const instructions = items.find((item) => item.kind === "context-file");
        assert.ok(instructions);
        assert.deepEqual(
          instructions.children.map((item) => item.id).sort(),
          files.map((file) => `context-file:${file.path}`).sort(),
        );
        for (const file of files) {
          const item = instructions.children.find(
            (item) => item.id === `context-file:${file.path}`,
          );
          assert.equal(item.text, file.content);
          assert.ok(item.tokens > 0);
        }
        assert.ok(
          !items.some(
            (item) =>
              item.kind === "prompt-addition" &&
              item.text.includes("Project instructions"),
          ),
        );
      },
    );
  } else {
    console.log(
      "pi-context-view not installed, skipping viewer classification check",
    );
  }
}

console.log(`${checks} checks, ${found.length} rules discovered under ${root}`);
if (process.exitCode) {
  console.error("FAILED");
}
