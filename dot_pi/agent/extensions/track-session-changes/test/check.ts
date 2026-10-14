/**
 * Self-check for ../index.ts: the edit details of pi and omp, and the event
 * handlers with a stub pi, a scratch HOME, and a scratch git repo. The last
 * group reads the installed pi package at PI_PACKAGE.
 *
 * Run: node test/check.ts, from the extension directory.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { registerHooks } from "node:module";
import * as os from "node:os";
import * as path from "node:path";

// In the repository, ./core.ts is the chezmoi link symlink_core.ts, so the
// import goes to the hook source that the link points at after an apply.
const core = new URL(
  "../../../../../dot_claude/hooks/track-session-changes/core.ts",
  import.meta.url,
).href;
registerHooks({
  resolve: (specifier, context, next) =>
    specifier === "./core.ts" &&
    context.parentURL?.endsWith("/track-session-changes/index.ts")
      ? { url: core, shortCircuit: true }
      : next(specifier, context),
});
const { default: extension, editFiles } = await import("../index.ts");

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

// ── Edit details ──────────────────────────────────────────────────────────────

check("pi edit: the input path, with the line of the details", () => {
  assert.deepEqual(
    editFiles({ firstChangedLine: 3 }, { path: "f.txt" }, "/w"),
    [{ status: "M", path: "/w/f.txt", line: 3 }],
  );
  assert.deepEqual(editFiles({}, { path: "@~/f.txt" }, "/w"), [
    { status: "M", path: path.join(os.homedir(), "f.txt"), line: undefined },
  ]);
});

check("omp edit: one file, many files, create, delete, move", () => {
  // The details of real omp 18.8.7 edits, from the probe of 2026-10-14.
  assert.deepEqual(
    editFiles(
      { op: "update", path: "/w/f.txt", firstChangedLine: 3 },
      { path: "f.txt" },
      "/w",
    ),
    [{ status: "M", path: "/w/f.txt", line: 3 }],
  );
  const many = {
    firstChangedLine: 2,
    perFileResults: [
      { path: "/w/f.txt", firstChangedLine: 2, op: "update" },
      { path: "/w/g.txt", firstChangedLine: 2, op: "update" },
    ],
  };
  assert.deepEqual(editFiles(many, { paths: ["f.txt", "g.txt"] }, "/w"), [
    { status: "M", path: "/w/f.txt", line: 2 },
    { status: "M", path: "/w/g.txt", line: 2 },
  ]);
  assert.deepEqual(editFiles({ op: "create", path: "/w/n.txt" }, {}, "/w"), [
    { status: "A", path: "/w/n.txt", line: 1 },
  ]);
  assert.deepEqual(editFiles({ op: "delete", path: "/w/g.txt" }, {}, "/w"), [
    { status: "D", path: "/w/g.txt", line: undefined },
  ]);
  assert.deepEqual(
    editFiles(
      {
        op: "update",
        path: "/w/b.txt",
        move: "/w/b.txt",
        sourcePath: "/w/a.txt",
        firstChangedLine: 4,
      },
      {},
      "/w",
    ),
    [
      { status: "D", path: "/w/a.txt" },
      { status: "A", path: "/w/b.txt", line: 4 },
    ],
  );
});

// ── Handlers ──────────────────────────────────────────────────────────────────

const tmp = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "track-session-changes-pi-")),
);
const home = process.env.HOME;
process.env.HOME = path.join(tmp, "home");
process.on("exit", () => {
  process.env.HOME = home;
  fs.rmSync(tmp, { recursive: true, force: true });
});
const repo = path.join(tmp, "repo");
fs.mkdirSync(repo);
fs.writeFileSync(path.join(repo, "f.txt"), "a\nb\nc\n");
const sh = (command: string) =>
  execFileSync("bash", ["-c", command], { cwd: repo, stdio: "ignore" });
sh(
  "git init -q . && git add -A && git -c user.name=t -c user.email=t@t commit -q --no-verify -m init",
);

type Handler = (event: Record<string, unknown>, ctx: unknown) => void;
function load(title: string, session: string) {
  const handlers = new Map<string, Handler>();
  const was = process.title;
  process.title = title;
  extension({
    on: (name: string, handler: Handler) => handlers.set(name, handler),
  } as never);
  process.title = was;
  const ctx = { cwd: repo, sessionManager: { getSessionId: () => session } };
  return (name: string, event: Record<string, unknown>) =>
    handlers.get(name)!(event, ctx);
}
const log = (agent: string, session: string) => {
  const file = path.join(
    tmp,
    "home/.local/state/agent-changes",
    agent,
    `${session}.tsv`,
  );
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split("\t").slice(2))
    : [];
};

check("bash: a call ID with | and / still snapshots", () => {
  const fire = load("pi", "s1");
  const id = "call_x|fc_y/1";
  fire("tool_call", {
    toolName: "bash",
    toolCallId: id,
    input: { command: "x" },
  });
  sh("printf 'a\\nB\\nc\\n' > f.txt && printf 'new\\n' > n.txt");
  fire("tool_result", {
    toolName: "bash",
    toolCallId: id,
    input: {},
    isError: false,
  });
  assert.deepEqual(log("pi", "s1"), [
    ["bash", "M", repo, path.join(repo, "f.txt"), "2"],
    ["bash", "A", repo, path.join(repo, "n.txt"), "1"],
  ]);
});

check(
  "write: create gives line 1, update the first changed line, no change no line",
  () => {
    const fire = load("pi", "s2");
    const write = (id: string, file: string, text: string) => {
      fire("tool_call", {
        toolName: "write",
        toolCallId: id,
        input: { path: file, content: text },
      });
      fs.writeFileSync(path.join(repo, file), text);
      fire("tool_result", {
        toolName: "write",
        toolCallId: id,
        input: {},
        isError: false,
      });
    };
    write("w1", "w.txt", "one\ntwo\n");
    write("w2", "w.txt", "one\ntwo\nthree\n");
    write("w3", "w.txt", "one\ntwo\nthree\n");
    assert.deepEqual(log("pi", "s2"), [
      ["write", "A", repo, path.join(repo, "w.txt"), "1"],
      ["write", "M", repo, path.join(repo, "w.txt"), "3"],
    ]);
  },
);

check("omp: its own log, and a failed edit logs nothing", () => {
  const fire = load("omp", "s3");
  fire("tool_call", {
    toolName: "edit",
    toolCallId: "e1",
    input: { path: "f.txt" },
  });
  fire("tool_result", {
    toolName: "edit",
    toolCallId: "e1",
    input: {},
    isError: true,
    details: undefined,
  });
  fire("tool_call", {
    toolName: "edit",
    toolCallId: "e2",
    input: { path: "f.txt" },
  });
  fire("tool_result", {
    toolName: "edit",
    toolCallId: "e2",
    input: { path: "f.txt" },
    isError: false,
    details: {
      op: "update",
      path: path.join(repo, "f.txt"),
      firstChangedLine: 2,
    },
  });
  assert.deepEqual(log("omp", "s3"), [
    ["edit", "M", repo, path.join(repo, "f.txt"), "2"],
  ]);
  assert.deepEqual(log("pi", "s3"), []);
});

// ── Installed pi package ──────────────────────────────────────────────────────

check("pi declares firstChangedLine for edit and no details for write", () => {
  const pkg = process.env.PI_PACKAGE;
  if (!pkg) return console.log("skip: PI_PACKAGE is not set");
  const edit = fs.readFileSync(
    path.join(pkg, "dist/core/tools/edit.d.ts"),
    "utf8",
  );
  assert.match(edit, /firstChangedLine\?: number;/);
  const types = fs.readFileSync(
    path.join(pkg, "dist/core/extensions/types.d.ts"),
    "utf8",
  );
  assert.match(types, /toolName: "write";\s+details: undefined;/);
  assert.match(types, /on\(event: "tool_call"/);
  assert.match(types, /on\(event: "tool_result"/);
});

console.log(
  process.exitCode ? `${checks} checks, some failed` : `${checks} checks pass`,
);
