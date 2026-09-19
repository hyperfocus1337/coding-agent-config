/**
 * Self-check for ../summary.ts, the one decision this extension makes.
 *
 * Run: node test/check.ts, from the extension directory, or `just pi-check`.
 *
 * The last group runs against the installed pi package, which this file reads as
 * text: the package sits outside the repository, so node cannot import it. It
 * fails when pi renames what ../index.ts builds on.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { summary, type Block } from "../summary.ts";

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

const text = (...lines: string[]): Block[] => [
  { type: "text", text: lines.join("\n") },
];
const collapsed = { expanded: false, isPartial: false };

// ── The summary line ──────────────────────────────────────────────────────────

check("a result of several lines counts them", () => {
  assert.equal(summary(text("a", "b", "c"), collapsed, false, {}), "3 lines");
});

check("one line is singular", () => {
  assert.equal(summary(text("a"), collapsed, false, {}), "1 line");
});

check("trailing blank lines do not count", () => {
  assert.equal(
    summary(text("a", "b", "", ""), collapsed, false, {}),
    "2 lines",
  );
});

check("a streaming result says so", () => {
  assert.equal(
    summary(text("a", "b"), { expanded: false, isPartial: true }, false, {}),
    "2 lines so far",
  );
});

check("a truncated result says so", () => {
  assert.equal(
    summary(text("a"), collapsed, false, { truncation: { truncated: true } }),
    "1 line (truncated)",
  );
});

check("a block that is not text counts for nothing", () => {
  const blocks: Block[] = [{ type: "image" }, ...text("a", "b")];
  assert.equal(summary(blocks, collapsed, false, {}), "2 lines");
});

// ── When pi's own renderer runs instead ───────────────────────────────────────

check("an expanded row keeps the built-in output", () => {
  assert.equal(
    summary(text("a", "b"), { expanded: true, isPartial: false }, false, {}),
    undefined,
  );
});

check("a failed call keeps the built-in output", () => {
  assert.equal(summary(text("a", "b"), collapsed, true, {}), undefined);
});

check("a result with no text keeps the built-in output", () => {
  assert.equal(summary(text(""), collapsed, false, {}), undefined);
  assert.equal(summary([], collapsed, false, undefined), undefined);
});

// ── The off switch ────────────────────────────────────────────────────────────

const source = fs.readFileSync(new URL("../index.ts", import.meta.url), "utf-8");
const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf-8");

check("the off switch is the value the README documents", () => {
  assert.match(source, /process\.env\.PI_COMPACT_BASH === "0"/);
  assert.ok(
    readme.includes("PI_COMPACT_BASH=0"),
    "README.md does not document PI_COMPACT_BASH=0",
  );
});

// ── The installed pi package ──────────────────────────────────────────────────

const piPackage = process.env.PI_PACKAGE;
if (piPackage === undefined) {
  console.log("PI_PACKAGE unset, skipping the installed-package group");
} else {
  const types = fs.readFileSync(
    path.join(piPackage, "dist", "index.d.ts"),
    "utf-8",
  );

  check("pi exports createBashToolDefinition", () => {
    assert.ok(
      types.includes("createBashToolDefinition"),
      "createBashToolDefinition is gone from dist/index.d.ts",
    );
  });

  check("the built-in bash renderer still previews five lines", () => {
    const renderer = fs.readFileSync(
      path.join(piPackage, "dist", "core", "tools", "renderers", "bash.js"),
      "utf-8",
    );
    assert.match(renderer, /BASH_PREVIEW_LINES = 5/);
  });

  check("a tool definition still carries renderResult", () => {
    const toolTypes = fs.readFileSync(
      path.join(piPackage, "dist", "core", "extensions", "types.d.ts"),
      "utf-8",
    );
    assert.match(toolTypes, /renderResult\?:/);
  });
}

console.log(`${checks} checks`);
