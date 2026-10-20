/**
 * Self-check for ../core.ts and its three adapters: the mod with a stub $,
 * the pi extension with a stub pi, and command.ts as a child process.
 *
 * Run: node test/check.ts, from the hook directory.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  allowList,
  parseRules,
  stripQuotedHeredocs,
  suggest,
  violation,
} from "../core.ts";
import { register } from "../hooks/register.ts";
import extension from "../pi.ts";

const hook = path.dirname(import.meta.dirname);
const rules = parseRules(fs.readFileSync(path.join(hook, "rules"), "utf8"));
const none = new Set<string>();

let failures = 0;
async function check(what: string, run: () => void | Promise<void>) {
  try {
    await run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${what}\n  ${(error as Error).message}`);
  }
}

const blocks = (line: string) =>
  check(`blocks ${JSON.stringify(line)}`, () =>
    assert.ok(violation(line, rules, none)),
  );
const allows = (line: string) =>
  check(`allows ${JSON.stringify(line)}`, () =>
    assert.equal(violation(line, rules, none), undefined),
  );

// The shipped rules file parses whole: a lost last line is enforcement
// disappearing with no error anywhere.
await check("rules: 2 parsed", () => assert.equal(rules.length, 2));

// A banned tool in command position blocks.
for (const line of [
  "npm i",
  "sudo npm ci",
  "CI=1 npm run build",
  "timeout 30 npm ci",
  "/usr/local/bin/npm i",
  "cd web && yarn add lodash",
  "yarn",
  "(cd web && npm i)",
  "{ npm i; }",
  "echo $(npm bin)",
  "echo `npm bin`",
  "PATH=$(npm bin):$PATH",
  "cd x\nnpm i",
])
  await blocks(line);

// A banned name as an argument, as text, or inside a quoted string allows.
for (const line of [
  "pnpm i",
  "rg npm",
  "git commit -m 'switch to npm'",
  "cat package-lock.json",
  "npmrc-check",
  "git commit -m 'fix; npm bump'",
  'echo "a && npm i"',
])
  await allows(line);

// A quoted-delimiter heredoc body is text; an unquoted one can run $(...).
await allows("cat > f <<'EOF'\nnever `npm` or `yarn`, it's slow\nEOF");
await allows('cat > f <<"EOF"\n`npm i`\nEOF');
await allows("cat > f <<\\EOF\n`npm i`\nEOF");
await allows("cat > f <<-'EOF'\n\t`npm i`\n\tEOF");
await blocks("cat > f <<'EOF'\ntext\nEOF\nnpm i");
await blocks("cat > f <<EOF\n$(npm bin)\nEOF");
await check("heredoc: the line after the body stays", () =>
  assert.equal(stripQuotedHeredocs("a <<'X'\nb\nX\nc"), "a <<'X'\nc"),
);

// The suggestion swaps a whole word only, and skips multi-line commands.
for (const [line, expected] of [
  ["npm i", "pnpm i"],
  ["pnpm i && npm ci", "pnpm i && pnpm ci"],
  ["/usr/local/bin/npm i", "/usr/local/bin/pnpm i"],
  ["cd x\nnpm i", ""],
] as const)
  await check(`suggest ${JSON.stringify(line)}`, () =>
    assert.equal(suggest(line, "npm", "pnpm"), expected),
  );

// The rule comes back whole, multi-word replacements intact.
await check("maps npm to pnpm", () =>
  assert.deepEqual(violation("npm i", rules, none), {
    tool: "npm",
    replacement: "pnpm",
  }),
);
await check("maps npx to pnpm dlx", () =>
  assert.deepEqual(
    violation("npx create-vite app", parseRules("npx\tpnpm dlx\n"), none),
    { tool: "npx", replacement: "pnpm dlx" },
  ),
);

// An allowlisted tool allows again; only the named tool is exempt.
await check("allowlist: file and env", () => {
  const allowed = allowList("# why\nnpm # client repo\n", "bun:deno");
  assert.deepEqual([...allowed], ["npm", "bun", "deno"]);
  assert.equal(violation("npm i", rules, allowed), undefined);
  assert.ok(violation("yarn add lodash", rules, allowed));
});

// A scratch repo with an allowlist file, for the adapters.
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "enforce-cli-tools-"));
fs.writeFileSync(path.join(repo, ".claude-allow-cli-tools"), "yarn\n");

// command.ts: exit 2 with the message on stderr, exit 0 and silence otherwise.
const runCommand = (command: string) =>
  spawnSync(process.execPath, [path.join(hook, "command.ts")], {
    input: JSON.stringify({ cwd: repo, tool_input: { command } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "", CLAUDE_ALLOW_CLI_TOOLS: "" },
  });
await check("command.ts: blocks npm", () => {
  const ran = runCommand("npm i");
  assert.equal(ran.status, 2);
  assert.match(ran.stderr, /use `pnpm` instead[\s\S]*suggested: pnpm i/);
  assert.equal(ran.stdout, "");
});
await check("command.ts: allows yarn through the repo allowlist", () => {
  const ran = runCommand("yarn add x");
  assert.equal(ran.status, 0);
  assert.equal(ran.stderr + ran.stdout, "");
});

// pi.ts: a stub pi that keeps the tool_call handler.
type Handler = (event: unknown, ctx: unknown) => unknown;
let piHandler: Handler | undefined;
extension({
  on: (name: string, handler: Handler) => {
    if (name === "tool_call") piHandler = handler;
  },
} as never);
const piCall = (toolName: string, command: string) =>
  piHandler?.({ toolName, input: { command } }, { cwd: repo });
await check("pi.ts: blocks npm with the message", () => {
  const result = piCall("bash", "npm i") as { block: boolean; reason: string };
  assert.equal(result.block, true);
  assert.match(result.reason, new RegExp(`${repo}/.claude-allow-cli-tools`));
});
await check("pi.ts: allows yarn, and other tools", () => {
  assert.equal(piCall("bash", "yarn add x"), undefined);
  assert.equal(piCall("read", "npm i"), undefined);
});

// hooks/register.ts: a stub $ over the real files, and a next that passes.
type Hook = (...args: unknown[]) => Promise<unknown>;
let modHook: Hook | undefined;
register(
  ((_event: string, _matcher: unknown, hook: Hook) => {
    modHook = hook;
  }) as never,
  {} as never,
);
const stub$ = {
  session: { root: async () => repo },
  plugin: { root: hook },
  fs: { read: async (file: string) => fs.readFileSync(file, "utf8") },
  env: { get: async () => undefined },
};
const passed = { ran: true };
const modCall = (command: string) =>
  modHook?.(stub$, { tool: "Bash", command }, async () => passed);
await check("register.ts: denies npm", async () => {
  const result = (await modCall("npm i")) as { deny: string };
  assert.match(result.deny, /use `pnpm` instead/);
});
await check("register.ts: passes yarn through the repo allowlist", async () =>
  assert.equal(await modCall("yarn add x"), passed),
);

fs.rmSync(repo, { recursive: true });
if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
