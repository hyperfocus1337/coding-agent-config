/**
 * Self-check for ../core.ts and its two adapters: the mod with a stub `on`,
 * and the pi extension with a stub pi.
 *
 * Run: node test/check.ts, from the hook directory.
 */

import assert from "node:assert/strict";
import { MESSAGE, violation } from "../core.ts";
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

// The trailer in a commit message, in every form the model writes it.
for (const line of [
  "git commit -F - <<'EOF'\nfix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF",
  "git commit -m 'fix: x' -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'",
  "git add a && git commit -m \"$(printf 'fix\\n\\nCo-authored-by: Claude <noreply@anthropic.com>')\"",
  "git -C repo commit --amend -m 'x\n\nco-authored-by: claude code'",
  // Other agents, and a human: any co-author is blocked.
  "git commit -m 'fix: x' -m 'Co-authored-by: aider (gpt-5) <noreply@aider.chat>'",
  "git commit -m 'fix: x' -m 'Co-authored-by: Cursor Agent <cursoragent@cursor.com>'",
  "git commit -m 'fix: x' -m 'Co-Authored-By: Alice <alice@example.com>'",
])
  await check(`blocks ${JSON.stringify(line)}`, () =>
    assert.equal(violation(line), MESSAGE),
  );

// No trailer, or no commit as a whole word.
for (const line of [
  "git commit -m 'fix: x'",
  "git log --grep='Co-Authored-By: Claude'",
  "rg -n 'Co-Authored-By: Claude' .",
  "rg -n 'co-authored-by: claude' committed.txt",
  "git commit-tree HEAD^{tree} -m 'Co-Authored-By: Claude'",
])
  await check(`allows ${JSON.stringify(line)}`, () =>
    assert.equal(violation(line), undefined),
  );

const blocked = "git commit -m 'x' -m 'Co-Authored-By: Claude'";

// pi.ts: a stub pi that keeps the tool_call handler.
type Handler = (event: unknown) => unknown;
let piHandler: Handler | undefined;
extension({
  on: (name: string, handler: Handler) => {
    if (name === "tool_call") piHandler = handler;
  },
} as never);
const piCall = (toolName: string, command: string) =>
  piHandler?.({ toolName, input: { command } });
await check("pi.ts: blocks the trailer with the message", () =>
  assert.deepEqual(piCall("bash", blocked), { block: true, reason: MESSAGE }),
);
await check("pi.ts: allows a plain commit, and other tools", () => {
  assert.equal(piCall("bash", "git commit -m x"), undefined);
  assert.equal(piCall("write", blocked), undefined);
});

// hooks/register.ts: a stub on, and a next that passes.
type Hook = (...args: unknown[]) => Promise<unknown>;
let modMatcher: unknown;
let modHook: Hook | undefined;
register(
  ((_event: string, matcher: unknown, hook: Hook) => {
    modMatcher = matcher;
    modHook = hook;
  }) as never,
  {} as never,
);
const passed = { ran: true };
const modCall = (command: string) =>
  modHook?.({}, { tool: "Bash", command }, async () => passed);
await check("register.ts: hooks Bash only", () =>
  assert.deepEqual(modMatcher, { tool: "Bash" }),
);
await check("register.ts: denies the trailer", async () =>
  assert.deepEqual(await modCall(blocked), { deny: MESSAGE }),
);
await check("register.ts: passes a plain commit", async () =>
  assert.equal(await modCall("git commit -m x"), passed),
);

if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
