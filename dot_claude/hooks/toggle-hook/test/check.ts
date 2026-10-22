/**
 * Self-check for ../core.ts and its two adapters: the mod with a stub `on`
 * and `$`, and the pi extension with a stub pi. The `--repo` cases run the
 * real git in a temporary repository, with a temporary global config.
 *
 * Run: node test/check.ts, from the hook directory.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  command,
  HOOKS,
  NAMES,
  PARTS,
  status,
  toggle,
  toggleRepo,
  type Git,
} from "../core.ts";
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
await check(
  "no argument lists each hook, its formatters, and the scope",
  () => {
    const { value, text } = toggle("lint-code", "", [
      "lint-prose",
      "format-code.shfmt",
    ]);
    assert.equal(value, "lint-code");
    assert.equal(text.split("\n").length, NAMES.length);
    assert.ok(text.includes("\noff  session  lint-code\n"));
    assert.ok(text.includes("\noff  repo     lint-prose\n"));
    assert.ok(text.includes("\n  off  repo     shfmt\n"));
    assert.ok(text.includes("\non            type-check-tsc\n"));
  },
);
await check("all turns every hook off, then on, and keeps other names", () => {
  const off = toggle("typo", "all");
  assert.equal(off.value, ["typo", ...HOOKS].join(" "));
  assert.deepEqual(toggle(off.value, "all"), {
    value: "typo",
    text: "All hooks are on.",
  });
  assert.equal(toggle("lint-code", "all").value, undefined);
  assert.match(
    toggle("lint-code", "all", ["lint-prose"]).text,
    /^All hooks are on, but this repository turns off lint-prose\./,
  );
});
await check("a hook that the repository turns off stays off", () =>
  assert.deepEqual(toggle("lint-code", "lint-prose", ["lint-prose"]), {
    value: "lint-code",
    text: "lint-prose is off for this repository. Use /toggle-hook --repo lint-prose.",
  }),
);
await check("a formatter name needs --repo", () =>
  assert.deepEqual(toggle(undefined, "format-code.shfmt"), {
    value: undefined,
    text: "format-code.shfmt has a toggle for the repository only. Use /toggle-hook --repo format-code.shfmt.",
  }),
);
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
await check("--repo: a name flips its key, all flips the hooks", () => {
  assert.deepEqual(toggleRepo(undefined, "format-code.shfmt", []), {
    off: ["format-code.shfmt"],
    on: [],
    text: "format-code.shfmt is off for this repository.",
  });
  assert.deepEqual(toggleRepo(undefined, "lint-prose", ["lint-prose"]).on, [
    "lint-prose",
  ]);
  assert.deepEqual(toggleRepo(undefined, "all", []).off, HOOKS);
  assert.deepEqual(
    toggleRepo(undefined, "all", ["lint-code", "format-code.shfmt"]).on,
    ["lint-code"],
  );
  assert.ok(
    toggleRepo(undefined, "block-secret-commits", []).text.includes(
      "is a guard",
    ),
  );
  assert.ok(
    toggleRepo(undefined, "shfmt", []).text.startsWith("shfmt is not a hook."),
  );
});
await check("PARTS holds the keys of FORMATTERS in format-code", () => {
  const source = fs.readFileSync(
    new URL("../../format-code/core.ts", import.meta.url),
    "utf8",
  );
  assert.deepEqual(
    [...source.matchAll(/^\s+key: "([\w-]+)",$/gm)].map(([, key]) => key),
    PARTS.get("format-code"),
  );
});
await check("status names only the hooks that are off", () => {
  assert.equal(status(undefined), undefined);
  assert.equal(status("typo"), undefined);
  assert.equal(
    status("lint-prose typo format-prettier"),
    "hooks off: format-prettier, lint-prose",
  );
  assert.equal(
    status("lint-prose lint-code", ["lint-code", "format-code.shfmt"]),
    "hooks off: format-code.shfmt (repo), lint-code (repo), lint-prose",
  );
});

// --- command, with the real git ---

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "toggle-hook-test."));
const repo = `${tmp}/repo`;
const global = `${tmp}/gitconfig`;
fs.mkdirSync(repo);
fs.writeFileSync(global, "");
// The git config of the person who runs the check stays out.
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: global,
  GIT_CONFIG_NOSYSTEM: "1",
};
const gitIn =
  (cwd: string): Git =>
  async (args) => {
    const ran = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    return ran.error
      ? undefined
      : { exitCode: ran.status ?? 1, stdout: ran.stdout };
  };
const inRepo = gitIn(repo);
const local = async (key: string) =>
  (await inRepo(["config", "--local", "--get", key]))?.stdout.trim();
await inRepo(["init", "-q"]);

await check("command: --repo writes false, then removes the key", async () => {
  assert.deepEqual(
    await command("lint-code", "--repo  format-code.shfmt", inRepo),
    {
      value: "lint-code",
      text: "format-code.shfmt is off for this repository.",
      repo: ["format-code.shfmt"],
    },
  );
  assert.equal(await local("agent-hook.format-code.shfmt"), "false");
  const on = await command("lint-code", "--repo format-code.shfmt", inRepo);
  assert.deepEqual(on.repo, []);
  assert.equal(await local("agent-hook.format-code.shfmt"), "");
});
await check(
  "command: --repo all, and a session toggle of a repo hook",
  async () => {
    assert.deepEqual(
      (await command(undefined, "--repo all", inRepo)).repo,
      HOOKS,
    );
    const session = await command(undefined, "lint-prose", inRepo);
    assert.equal(session.value, undefined);
    assert.match(session.text, /off for this repository/);
    assert.deepEqual((await command(undefined, "--repo all", inRepo)).repo, []);
  },
);
await check(
  "command: a global false gets a true in the repository",
  async () => {
    fs.writeFileSync(global, '[agent-hook "lint-code"]\n\tenabled = false\n');
    assert.deepEqual((await command(undefined, "", inRepo)).repo, [
      "lint-code",
    ]);
    const on = await command(undefined, "--repo lint-code", inRepo);
    assert.equal(on.text, "lint-code is on for this repository.");
    assert.deepEqual(on.repo, []);
    assert.equal(await local("agent-hook.lint-code.enabled"), "true");
    fs.writeFileSync(global, "");
    await inRepo(["config", "--unset", "agent-hook.lint-code.enabled"]);
  },
);
await check(
  "command: --repo outside a repository changes nothing",
  async () => {
    const outside = await command("lint-code", "--repo lint-prose", gitIn(tmp));
    assert.equal(outside.value, "lint-code");
    assert.match(
      outside.text,
      /^Not changed: .*--repo needs a git repository\.$/,
    );
  },
);
await check(
  "command: a value that is not a boolean keeps the name on",
  async () => {
    await inRepo(["config", "agent-hook.lint-prose.enabled", "banana"]);
    assert.deepEqual((await command(undefined, "", inRepo)).repo, []);
    await inRepo(["config", "--unset", "agent-hook.lint-prose.enabled"]);
  },
);

// --- hooks/register.ts, with a stub on and $ ---

type Hook = (...args: unknown[]) => Promise<unknown>;
const hooks = new Map<string, Hook>();
register(
  ((event: string, ...rest: unknown[]) =>
    hooks.set(event, rest.at(-1) as Hook)) as never,
  {} as never,
);
const vars = new Map<string, string>();
const commands: { name: string }[] = [];
const statuses: (string | undefined)[] = [];
const stub$ = {
  command: {
    register: async (spec: { name: string }) => void commands.push(spec),
  },
  env: {
    get: async (name: string) => vars.get(name),
    set: async (name: string, value: string | undefined) => {
      if (value === undefined) vars.delete(name);
      else vars.set(name, value);
      return {};
    },
  },
  // $.process.run runs in the session folder, here the test repository.
  process: {
    run: async (argv: string[]) => {
      const ran = await inRepo(argv.slice(1));
      if (!ran) throw new Error("git did not start");
      return ran;
    },
  },
  ui: { status: (text: string | undefined) => void statuses.push(text) },
};
const run = (args: string) =>
  hooks.get("command.run")?.(stub$, { command: "toggle-hook", args });

await check("mod: session.start registers the command", async () => {
  vars.set("AGENT_HOOKS_DISABLE", "lint-code");
  await hooks.get("session.start")?.(stub$, {}, async () => ({}));
  assert.equal(commands[0]?.name, "toggle-hook");
  assert.equal(statuses.at(-1), "hooks off: lint-code");
});
await check("mod: the command sets the variable and the status", async () => {
  assert.deepEqual(await run("lint-code"), { text: "lint-code is on." });
  assert.equal(vars.has("AGENT_HOOKS_DISABLE"), false);
  assert.equal(statuses.at(-1), undefined);
  await run("lint-prose");
  assert.equal(vars.get("AGENT_HOOKS_DISABLE"), "lint-prose");
  assert.equal(statuses.at(-1), "hooks off: lint-prose");
});
await check("mod: --repo writes git config and the status", async () => {
  assert.deepEqual(await run("--repo lint-code"), {
    text: "lint-code is off for this repository.",
  });
  assert.equal(await local("agent-hook.lint-code.enabled"), "false");
  assert.equal(statuses.at(-1), "hooks off: lint-code (repo), lint-prose");
  await run("--repo lint-code");
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
let command_: Command | undefined;
let start: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
const notes: string[] = [];
const piStatus: (string | undefined)[] = [];
const ctx = {
  cwd: repo,
  ui: {
    notify: (text: string) => void notes.push(text),
    setStatus: (_key: string, text: string | undefined) =>
      void piStatus.push(text),
  },
};
extension({
  on: (_name: string, handler: typeof start) => (start = handler),
  registerCommand: (_name: string, options: Command) => (command_ = options),
} as never);

// pi.ts runs git with the environment of the process.
process.env.GIT_CONFIG_GLOBAL = global;
process.env.GIT_CONFIG_NOSYSTEM = "1";
await check("pi.ts: the command sets process.env and the status", async () => {
  await start?.({}, ctx);
  assert.equal(piStatus.at(-1), undefined);
  await command_?.handler("type-check-tsc", ctx);
  assert.equal(process.env.AGENT_HOOKS_DISABLE, "type-check-tsc");
  assert.equal(notes.at(-1), "type-check-tsc is off until you quit the agent.");
  assert.equal(piStatus.at(-1), "hooks off: type-check-tsc");
  await command_?.handler("type-check-tsc", ctx);
  assert.equal("AGENT_HOOKS_DISABLE" in process.env, false);
});
await check("pi.ts: --repo writes git config and the status", async () => {
  await command_?.handler("--repo format-code.terraform", ctx);
  assert.equal(
    notes.at(-1),
    "format-code.terraform is off for this repository.",
  );
  assert.equal(piStatus.at(-1), "hooks off: format-code.terraform (repo)");
  await start?.({}, ctx);
  assert.equal(piStatus.at(-1), "hooks off: format-code.terraform (repo)");
  await command_?.handler("--repo format-code.terraform", ctx);
  assert.equal(piStatus.at(-1), undefined);
});
await check("pi.ts: completes --repo, the hook names, and all", () => {
  const complete = (prefix: string) =>
    command_?.getArgumentCompletions(prefix).map((item) => item.value);
  assert.deepEqual(complete("type"), ["type-check-tsc", "type-check-pyrefly"]);
  assert.deepEqual(complete(" a"), ["all"]);
  assert.deepEqual(complete(""), ["--repo", ...HOOKS, "all"]);
  assert.deepEqual(complete("--repo format-code."), [
    "--repo format-code.terraform",
    "--repo format-code.shfmt",
    "--repo format-code.ruff",
  ]);
});

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
