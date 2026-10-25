/**
 * Checks ../core.ts with stub dcg results, ../io.ts with stub dcg scripts, and
 * ../pi.ts with a stub pi. The last group runs the installed dcg and is
 * skipped when ~/.local/bin/dcg is missing.
 *
 * Run: node test/check.ts, from the hook directory.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, FALLBACK, type Io } from "../core.ts";
import { DCG, nodeIo } from "../io.ts";
import extension from "../pi.ts";

const tmp = mkdtempSync(join(tmpdir(), "block-destructive-commands-test-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));

const stub = (exitCode: number, stdout = ""): Io => ({
  dcg: async () => ({ exitCode, stdout }),
});
const deny = JSON.stringify({
  reason: "reset discards work",
  rule_id: "git.reset",
});

// core: exit 1 blocks with the dcg reason; everything else allows.
assert.equal(await check("ls", stub(0)), undefined);
assert.equal(await check("x", stub(1, deny)), "reset discards work [git.reset]");
assert.equal(await check("x", stub(1, '{"reason":"r"}')), "r");
assert.equal(await check("x", stub(1, "not json")), FALLBACK);
assert.equal(await check("x", stub(1, '{"reason":""}')), FALLBACK);
assert.equal(await check("x", stub(3)), undefined);
assert.equal(await check("x", stub(-1)), undefined);
assert.equal(await check("x", { dcg: async () => undefined }), undefined);
let ran = false;
await check("  ", { dcg: async () => ((ran = true), undefined) });
assert.equal(ran, false, "an empty command does not run dcg");

// io: the argv dcg gets, the exit code, and a dcg that cannot start.
const script = (name: string, body: string) => {
  const path = join(tmp, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return path;
};
const echo = script("echo", `printf '%s|' "$@"; exit 1`);
assert.deepEqual(await nodeIo(tmp, echo).dcg("rm -rf /"), {
  exitCode: 1,
  stdout: "--robot|test|--dialect|posix|rm -rf /|",
});
assert.equal(await nodeIo(tmp, join(tmp, "missing")).dcg("ls"), undefined);
assert.equal(await nodeIo(join(tmp, "missing"), echo).dcg("ls"), undefined);

// pi: only a bash call with a string command reaches dcg.
type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
let handler: Handler | undefined;
extension({ on: (_: string, h: Handler) => (handler = h) } as never);
assert.ok(handler);
const call = (toolName: string, input: unknown) => handler!({ toolName, input }, { cwd: tmp });
assert.equal(await call("read", { command: "rm -rf /" }), undefined);
assert.equal(await call("bash", { command: 1 }), undefined);

// The installed dcg.
if (existsSync(DCG)) {
  const reason = await check("git reset --hard HEAD~1", nodeIo(tmp));
  assert.ok(reason, "dcg denies git reset --hard");
  assert.equal(await check("ls -la", nodeIo(tmp)), undefined);
  assert.deepEqual(await call("bash", { command: "git reset --hard HEAD~1" }), {
    block: true,
    reason,
  });
} else {
  console.log(`skipped: ${DCG} is missing`);
}

console.log("block-destructive-commands: ok");
