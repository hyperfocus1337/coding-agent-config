/**
 * Self-check for ../core.ts and its two adapters: the mod with a stub `on`
 * and `$`, and the pi extension with a stub pi.
 *
 * Run: node test/check.ts, from the hook directory.
 */

import assert from "node:assert/strict";
import { HOOKS, status, toggle } from "../core.ts";
import { register } from "../hooks/register.ts";
import extension from "../pi.ts";

let failures = 0;
function check(what: string, run: () => void | Promise<void>) {
  return Promise.resolve()
    .then(run)
    .catch((error: unknown) => {
      failures += 1;
      console.error(`FAIL ${what}\n  ${(error as Error).message}`);
    });
}

// --- core.ts ---

await check("a name flips the hook off, then on", () => {
  const off = toggle(undefined, " lint-prose ");
  assert.deepEqual(off, {
    value: "lint-prose",
    text: "lint-prose is off until you quit the agent.",
  });
  assert.deepEqual(toggle(off.value, "lint-prose"), {
    value: undefined,
    text: "lint-prose is on.",
  });
});
await check("a launch value with commas and other names", () =>
  assert.equal(
    toggle("lint-code,typo", "format-prettier").value,
    "lint-code typo format-prettier",
  ),
);
await check("no argument lists each hook", () => {
  const { value, text } = toggle("lint-code", "");
  assert.equal(value, "lint-code");
  assert.equal(text.split("\n").length, HOOKS.length);
  assert.ok(text.includes("off  lint-code"));
  assert.ok(text.includes("on   lint-prose"));
});
await check("all turns every hook off, then on, and keeps other names", () => {
  const off = toggle("typo", "all");
  assert.equal(off.value, ["typo", ...HOOKS].join(" "));
  assert.deepEqual(toggle(off.value, "all"), {
    value: "typo",
    text: "All hooks are on.",
  });
  assert.equal(toggle("lint-code", "all").value, undefined);
});
await check("a guard has no toggle", () => {
  const { value, text } = toggle(undefined, "enforce-cli-tools");
  assert.equal(value, undefined);
  assert.ok(text.includes("is a guard") && text.includes(".agent-allow"));
});
await check("an unknown name changes nothing", () => {
  const { value, text } = toggle("lint-code", "lint");
  assert.equal(value, "lint-code");
  assert.ok(text.startsWith("lint is not a hook."));
  assert.ok(
    toggle(undefined, "constructor").text.startsWith(
      "constructor is not a hook.",
    ),
  );
});
await check("status names only the hooks that are off", () => {
  assert.equal(status(undefined), undefined);
  assert.equal(status("typo"), undefined);
  assert.equal(
    status("lint-prose typo format-prettier"),
    "hooks off: format-prettier, lint-prose",
  );
});

// --- hooks/register.ts, with a stub on and $ ---

type Hook = (...args: unknown[]) => Promise<unknown>;
const hooks = new Map<string, Hook>();
register(
  ((event: string, ...rest: unknown[]) =>
    hooks.set(event, rest.at(-1) as Hook)) as never,
  {} as never,
);
const env = new Map<string, string>();
const commands: { name: string }[] = [];
const statuses: (string | undefined)[] = [];
const stub$ = {
  command: {
    register: async (spec: { name: string }) => void commands.push(spec),
  },
  env: {
    get: async (name: string) => env.get(name),
    set: async (name: string, value: string | undefined) => {
      if (value === undefined) env.delete(name);
      else env.set(name, value);
      return {};
    },
  },
  ui: { status: (text: string | undefined) => void statuses.push(text) },
};
const run = (args: string) =>
  hooks.get("command.run")?.(stub$, { command: "toggle-hook", args });

await check("mod: session.start registers the command", async () => {
  env.set("AGENT_HOOKS_DISABLE", "lint-code");
  await hooks.get("session.start")?.(stub$, {}, async () => ({}));
  assert.equal(commands[0]?.name, "toggle-hook");
  assert.equal(statuses.at(-1), "hooks off: lint-code");
});
await check("mod: the command sets the variable and the status", async () => {
  assert.deepEqual(await run("lint-code"), { text: "lint-code is on." });
  assert.equal(env.has("AGENT_HOOKS_DISABLE"), false);
  assert.equal(statuses.at(-1), undefined);
  await run("lint-prose");
  assert.equal(env.get("AGENT_HOOKS_DISABLE"), "lint-prose");
  assert.equal(statuses.at(-1), "hooks off: lint-prose");
});
await check("mod: a denied write says so", async () => {
  stub$.env.set = async () => ({ deny: "policy" }) as never;
  assert.deepEqual(await run("lint-code"), { text: "Not changed: policy" });
});

// --- pi.ts, with a stub pi ---

delete process.env.AGENT_HOOKS_DISABLE;
type Command = {
  getArgumentCompletions: (prefix: string) => { value: string }[];
  handler: (args: string, ctx: unknown) => Promise<void>;
};
let command: Command | undefined;
let start: ((event: unknown, ctx: unknown) => void) | undefined;
const notes: string[] = [];
const piStatus: (string | undefined)[] = [];
const ctx = {
  ui: {
    notify: (text: string) => void notes.push(text),
    setStatus: (_key: string, text: string | undefined) =>
      void piStatus.push(text),
  },
};
extension({
  on: (_name: string, handler: typeof start) => (start = handler),
  registerCommand: (_name: string, options: Command) => (command = options),
} as never);

await check("pi.ts: the command sets process.env and the status", async () => {
  start?.({}, ctx);
  assert.equal(piStatus.at(-1), undefined);
  await command?.handler("type-check-tsc", ctx);
  assert.equal(process.env.AGENT_HOOKS_DISABLE, "type-check-tsc");
  assert.equal(notes.at(-1), "type-check-tsc is off until you quit the agent.");
  assert.equal(piStatus.at(-1), "hooks off: type-check-tsc");
  await command?.handler("type-check-tsc", ctx);
  assert.equal("AGENT_HOOKS_DISABLE" in process.env, false);
});
await check("pi.ts: completes the hook names and all", () => {
  const complete = (prefix: string) =>
    command?.getArgumentCompletions(prefix).map((item) => item.value);
  assert.deepEqual(complete("type"), ["type-check-tsc", "type-check-pyrefly"]);
  assert.deepEqual(complete(" a"), ["all"]);
  assert.deepEqual(complete(""), [...HOOKS, "all"]);
});

if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
