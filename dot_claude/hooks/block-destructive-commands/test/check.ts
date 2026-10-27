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
  hookSpecificOutput: {
    permissionDecision: "deny",
    permissionDecisionReason: "reset discards work",
    ruleId: "core.git:reset-hard",
    allowOnceCode: "123456",
  },
});
const expected =
  "reset discards work\nRule: core.git:reset-hard\nUser approval: dcg allow-once 123456";

// core: hook denials exit 0 and preserve the rule and approval code.
assert.equal(await check("ls", stub(0)), undefined);
assert.equal(await check("x", stub(0, deny)), expected);
assert.equal(await check("x", stub(1, deny)), expected);
const complete = JSON.stringify({
  hookSpecificOutput: {
    permissionDecision: "deny",
    permissionDecisionReason: expected,
    ruleId: "core.git:reset-hard",
    allowOnceCode: "123456",
  },
});
assert.equal(await check("x", stub(0, complete)), expected, "do not duplicate details");
assert.equal(
  await check("x", stub(0, '{"hookSpecificOutput":{"permissionDecision":"deny"}}')),
  FALLBACK,
);
assert.equal(
  await check(
    "x",
    stub(
      0,
      JSON.stringify({
        hookSpecificOutput: { permissionDecision: "deny", allowOnceCode: "not-a-code" },
      }),
    ),
  ),
  FALLBACK,
  "do not invent an approval command",
);
assert.equal(
  await check("x", stub(0, '{"hookSpecificOutput":{"permissionDecision":"allow"}}')),
  undefined,
);
assert.equal(await check("x", stub(0, "not json")), undefined);
assert.equal(await check("x", stub(0, "null")), undefined);
assert.equal(await check("x", stub(1, "not json")), FALLBACK);
assert.equal(await check("x", stub(1, "{}")), FALLBACK);
assert.equal(await check("x", stub(3)), undefined);
assert.equal(await check("x", stub(-1)), undefined);
assert.equal(await check("x", { dcg: async () => undefined }), undefined);
let ran = false;
await check("  ", { dcg: async () => ((ran = true), undefined) });
assert.equal(ran, false, "an empty command does not run dcg");

// io: hook argv, self-heal guard, stdin payload, and a dcg that cannot start.
const script = (name: string, body: string) => {
  const path = join(tmp, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return path;
};
const echo = script(
  "echo",
  `printf '%s|' "$@" "$DCG_NO_SELF_HEAL"; IFS= read -r payload; printf '%s' "$payload"`,
);
const command = 'git -C "a b" rev-parse --show-toplevel';
assert.deepEqual(await nodeIo(tmp, echo).dcg(command), {
  exitCode: 0,
  stdout: "hook|1|" + JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: tmp }),
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
  assert.match(reason, /core\.git:reset-hard/);
  assert.match(reason, /dcg allow-once \d{6}\b/);
  assert.equal(await check("ls -la", nodeIo(tmp)), undefined);
  assert.equal(
    await check("git -C /any/repository rev-parse --show-toplevel", nodeIo(tmp)),
    undefined,
  );
  const blocked = (await call("bash", { command: "git reset --hard HEAD~1" })) as {
    block: boolean;
    reason: string;
  };
  assert.equal(blocked.block, true);
  assert.match(blocked.reason, /core\.git:reset-hard/);
  assert.match(blocked.reason, /dcg allow-once \d{6}\b/);
} else {
  console.log(`skipped: ${DCG} is missing`);
}

console.log("block-destructive-commands: ok");
