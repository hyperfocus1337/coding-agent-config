/**
 * Checks ../core.ts with stub dcg results, ../io.ts with stub dcg scripts, and
 * ../pi.ts with a stub pi. The last group runs the installed dcg and is
 * skipped when ~/.local/bin/dcg is missing.
 *
 * Run: node test/check.ts, from the hook directory.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, FAILURE, FALLBACK, type Io } from "../core.ts";
import { DCG, nodeIo } from "../io.ts";
import extension from "../pi.ts";

const tmp = mkdtempSync(join(tmpdir(), "block-destructive-commands-test-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
// Keep the caller's session and git toggles out of these checks.
delete process.env.AGENT_HOOKS_DISABLE;
process.env.GIT_CONFIG_GLOBAL = join(tmp, "gitconfig");
process.env.GIT_CONFIG_NOSYSTEM = "1";
process.env.GIT_CONFIG_COUNT = "0";

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
for (const output of ["not json", "null", "[]", '{"hookSpecificOutput":{}}']) {
  assert.equal(await check("x", stub(0, output)), FAILURE);
}
assert.equal(await check("x", stub(1, "not json")), FALLBACK);
assert.equal(await check("x", stub(1, "{}")), FALLBACK);
for (const code of [2, 3, 127, -1]) assert.equal(await check("x", stub(code)), FAILURE);
assert.equal(await check("x", { dcg: async () => undefined }), FAILURE);
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

// Toggles are read on each call, not when nodeIo is created.
const io = nodeIo(tmp, echo);
for (const value of ["block-destructive-commands", "lint-code,block-destructive-commands\ttypo"]) {
  process.env.AGENT_HOOKS_DISABLE = value;
  assert.equal(await check(command, io), undefined, "session toggle still allows");
}
process.env.AGENT_HOOKS_DISABLE = "block-destructive-commands-extra";
assert.ok(await io.dcg(command), "only the exact hook name turns it off");
delete process.env.AGENT_HOOKS_DISABLE;
const global = process.env.GIT_CONFIG_GLOBAL;
writeFileSync(global, '[agent-hook "block-destructive-commands"]\n enabled = false\n');
assert.equal(await check(command, io), undefined, "global toggle");
const repo = join(tmp, "repo");
mkdirSync(repo);
assert.equal(spawnSync("git", ["init", repo]).status, 0);
const localConfig = join(repo, ".git", "config");
const config = (value: string) =>
  writeFileSync(localConfig, `[agent-hook "block-destructive-commands"]\n enabled = ${value}\n`);
config("true");
assert.ok(await nodeIo(repo, echo).dcg(command), "repo true overrides global false");
writeFileSync(global, "");
config("false");
assert.equal(await check(command, nodeIo(repo, echo)), undefined, "repo toggle");
config("banana");
assert.ok(await nodeIo(repo, echo).dcg(command), "invalid config keeps dcg on");

// Command hooks preserve stdin, dcg output, and self-heal setting, but fail closed.
const home = join(tmp, "home");
mkdirSync(join(home, ".local", "bin"), { recursive: true });
writeFileSync(
  join(home, ".local", "bin", "dcg"),
  '#!/bin/sh\nprintf "%s|" "$DCG_NO_SELF_HEAL"\ncat\nexit 1\n',
  { mode: 0o755 },
);
const payload = JSON.stringify({ tool_name: "PowerShell", tool_input: { command }, cwd: repo });
const shell = (off = "") =>
  spawnSync("sh", [new URL("../guard.sh", import.meta.url).pathname], {
    cwd: repo,
    env: { ...process.env, HOME: home, AGENT_HOOKS_DISABLE: off },
    input: payload,
    encoding: "utf8",
  });
let result = shell();
assert.equal(result.status, 2);
assert.equal(result.stdout, `1|${payload}`);
for (const off of ["block-destructive-commands", "lint-code,block-destructive-commands\ttypo"]) {
  result = shell(off);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
}
assert.equal(shell("block-destructive-commands-extra").status, 2);
config("false");
assert.equal(shell().stdout, "");
assert.equal(shell().status, 0);
config("true");
writeFileSync(global, '[agent-hook "block-destructive-commands"]\n enabled = false\n');
assert.equal(shell().status, 2, "repo true overrides global false");
config("false");
assert.equal(shell().status, 0);
writeFileSync(localConfig, "");
assert.equal(shell().status, 0, "global false applies without a repo key");
writeFileSync(global, "");
assert.equal(shell().status, 2, "unset config keeps dcg on");

// Missing binaries, execution errors, malformed output, and timeouts block.
const binary = join(home, ".local", "bin", "dcg");
rmSync(binary);
assert.equal(shell().status, 2, "missing dcg");
assert.equal(await check("ls", nodeIo(tmp, binary)), FAILURE);
for (const code of [0, 1, 2, 3, 127]) {
  writeFileSync(binary, `#!/bin/sh\nexit ${code}\n`, { mode: 0o755 });
  assert.equal(shell().status, code === 0 ? 0 : 2, `dcg exit ${code}`);
}
writeFileSync(binary, '#!/bin/sh\nprintf "not json"\n', { mode: 0o755 });
assert.equal(shell().status, 2, "invalid JSON");
writeFileSync(binary, `#!/bin/sh\nprintf '%s' '${deny}'\n`, { mode: 0o755 });
assert.equal(shell().stdout, deny, "preserve JSON denials and approval codes");
const hangs = '#!/bin/sh\ntrap "" TERM\nwhile :; do :; done\n';
writeFileSync(binary, hangs, { mode: 0o755 });
const timed = spawnSync("sh", [new URL("../guard.sh", import.meta.url).pathname], {
  cwd: repo,
  env: { ...process.env, HOME: home },
  input: payload,
  encoding: "utf8",
  timeout: 8000,
});
assert.equal(timed.status, 2, "internal timeout blocks before the agent timeout");
assert.equal(await check("ls", nodeIo(tmp, binary)), FAILURE);

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
  process.env.AGENT_HOOKS_DISABLE = "block-destructive-commands";
  assert.equal(await call("bash", { command: "git reset --hard HEAD~1" }), undefined);
  delete process.env.AGENT_HOOKS_DISABLE;
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
