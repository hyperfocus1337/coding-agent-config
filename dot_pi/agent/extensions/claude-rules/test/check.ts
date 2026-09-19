/**
 * Self-check for ../index.ts.
 *
 * Run: node test/check.ts, from the extension directory, or `just check-extensions`.
 *
 * The glob group is Claude's own table from https://code.claude.com/docs/en/memory,
 * so a change in `matches` that departs from it fails here first. The last group runs
 * against the real ~/.claude/rules.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  discover,
  matches,
  patterns,
  systemPromptBlock,
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

const rule = (...paths: string[]): Rule => ({ name: "r.md", paths, body: "" });

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

check(
  "the system-prompt block holds the unscoped bodies only, and is stable",
  () => {
    const found = discover(fixture);
    assert.equal(
      systemPromptBlock(found),
      "# Rules from ~/.claude/rules\n\n### B\n\nbody b",
    );
    assert.equal(
      systemPromptBlock(found),
      systemPromptBlock(discover(fixture)),
    );
  },
);

check("no unscoped rule means no block", () => {
  assert.equal(systemPromptBlock([rule("src/**")]), "");
});

fs.rmSync(fixture, { recursive: true });

// ── The installed tree ────────────────────────────────────────────────────────

const root = path.join(os.homedir(), ".claude", "rules");
const found = discover(root);

check("apply.md is the one scoped rule and carries three globs", () => {
  const scoped = found.filter((candidate) => candidate.paths.length > 0);
  assert.deepEqual(
    scoped.map((candidate) => candidate.name),
    ["apply.md"],
  );
  assert.deepEqual(scoped[0]?.paths, [
    "dot_claude/**",
    "dot_config/**",
    "dot_doom.d/**",
  ]);
});

check(
  "apply.md fires on a read inside dot_claude and not on one outside",
  () => {
    const apply = found.find((candidate) => candidate.name === "apply.md");
    assert.ok(apply);
    assert.equal(
      matches(apply, path.join("dot_claude", "rules", "code.md")),
      true,
    );
    assert.equal(matches(apply, "README.md"), false);
  },
);

check("the three unscoped rules are in the block, in full", () => {
  const block = systemPromptBlock(found);
  for (const name of ["code.md", "tools.md", "writing.md"]) {
    const body = fs.readFileSync(path.join(root, name), "utf-8").trimEnd();
    assert.ok(block.includes(body), `${name} missing from the block`);
  }
});

console.log(`${checks} checks, ${found.length} rules discovered under ${root}`);
if (process.exitCode) {
  console.error("FAILED");
}
