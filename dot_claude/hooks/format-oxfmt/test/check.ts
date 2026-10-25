/**
 * Self-check for ../core.ts and its adapters: the switch and the config
 * lookup through command.ts with the real git and oxfmt, then the pi and mod
 * adapters with stubs over the real files. The sweep and the amend hint are
 * in ./shared.ts, which format-prettier/test/check.ts covers in full, so this
 * check also keeps the two copies of the shared files the same.
 *
 * Run: node test/check.ts, from the hook directory. Fixtures live under $HOME,
 * because the hook skips /tmp and $TMPDIR. Without git or oxfmt the hook
 * does nothing, so the check skips with a message instead of passing.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { register } from "../hooks/register.ts";
import extension from "../pi.ts";

const hook = path.dirname(import.meta.dirname);
// A hook that /toggle-hook turned off in the agent that runs this check
// still runs here.
delete process.env.AGENT_HOOKS_DISABLE;

let failures = 0;
async function check(what: string, run: () => void | Promise<void>) {
  try {
    await run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${what}\n  ${(error as Error).message}`);
  }
}

// A Claude Code mod imports only files inside its own plugin, so each hook
// folder holds a copy. This check runs in the source tree only.
for (const file of ["shared.ts", "omp.ts"])
  await check(`${file} is the same in format-prettier`, () =>
    assert.equal(
      fs.readFileSync(path.join(hook, file), "utf8"),
      fs.readFileSync(path.join(hook, "../format-prettier", file), "utf8"),
      `copy format-oxfmt/${file} and format-prettier/${file} into each other`,
    ),
  );

for (const program of ["git", "oxfmt"])
  if (spawnSync(program, ["--version"]).error) {
    console.log(`SKIP no ${program} on PATH`);
    process.exit(failures ? 1 : 0);
  }

const tmp = fs.mkdtempSync(path.join(os.homedir(), ".format-oxfmt-test."));
// The git config of the person who runs the check stays out, and the
// format-staged-files pre-commit hook is off: it formats the file before the
// commit, and then nothing is left to amend.
fs.writeFileSync(`${tmp}/gitconfig`, "");
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: `${tmp}/gitconfig`,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "hook.claude-format-staged.enabled",
  GIT_CONFIG_VALUE_0: "false",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
});
const git = (cwd: string, ...args: string[]) => {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(ran.status, 0, `git ${args.join(" ")}: ${ran.stderr}`);
};

/** Runs command.ts with a payload; the timeout turns a loop into a failure. */
const hookRun = (payload: object) =>
  spawnSync(process.execPath, [path.join(hook, "command.ts")], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 30_000,
  });
const bash = (cwd: string, command: string) =>
  hookRun({ cwd, tool_input: { command } });
const edit = (cwd: string, file: string) =>
  hookRun({ cwd, tool_input: { file_path: file } });

/** A table oxfmt realigns: cells of unequal width, no padding yet. */
const RAW = "| a | bbbbbbbbbbbb |\n| --- | --- |\n| ccccccccccccccc | d |\n";
/** 93 characters: longer than 80, the width of the bundled config. */
const LONG =
  "const x = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5, zeta: 6, eta: 7, theta: 8 };\n";
const read = (file: string) => fs.readFileSync(file, "utf8");
const aligned = (file: string) => assert.match(read(file), /^\| a {2}/);
const unchanged = (what: string, file: string, text: string) =>
  check(what, () => assert.equal(read(file), text));
const quiet = (what: string, ran: ReturnType<typeof hookRun>) =>
  check(what, () => {
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(ran.stdout + ran.stderr, "");
  });

const repo = `${tmp}/repo`;
fs.mkdirSync(`${repo}/own`, { recursive: true });
git(repo, "init", "-q");
git(repo, "commit", "-q", "--allow-empty", "-m", "seed");

// --- Off by default ---

fs.writeFileSync(`${repo}/off.md`, RAW);
await quiet("no key: prints nothing", edit(repo, `${repo}/off.md`));
await unchanged("no key: the hook is off", `${repo}/off.md`, RAW);

// --- On through git config ---

git(repo, "config", "agent-hook.format-oxfmt.enabled", "true");
fs.writeFileSync(`${repo}/on.md`, RAW);
await quiet("on: an edit prints nothing", edit(repo, `${repo}/on.md`));
await check("on: formats an edited Markdown file", () =>
  aligned(`${repo}/on.md`),
);

fs.writeFileSync(`${repo}/wide.ts`, LONG);
edit(repo, `${repo}/wide.ts`);
await check("config: a file with no oxfmt config gets width 80", () =>
  assert.match(read(`${repo}/wide.ts`), /^ {2}alpha: 1,$/m),
);
fs.writeFileSync(`${repo}/own/.oxfmtrc.json`, '{ "printWidth": 120 }\n');
fs.writeFileSync(`${repo}/own/wide.ts`, LONG);
edit(repo, `${repo}/own/wide.ts`);
await unchanged(
  "config: the nearest oxfmt config wins",
  `${repo}/own/wide.ts`,
  LONG,
);

for (const [name, raw, done] of [
  ["a.toml", "a  =  1\n", "a = 1\n"],
  ["a.jsonc", '{"a":1,   "b":2}\n', '{ "a": 1, "b": 2 }\n'],
] as const) {
  fs.writeFileSync(`${repo}/${name}`, raw);
  edit(repo, `${repo}/${name}`);
  await unchanged(`on: formats ${name}`, `${repo}/${name}`, done);
}
fs.writeFileSync(`${repo}/script.py`, "x  =  1\n");
edit(repo, `${repo}/script.py`);
await unchanged("on: leaves .py", `${repo}/script.py`, "x  =  1\n");

fs.writeFileSync(`${repo}/SWEPT.md`, RAW);
await quiet("on: the Bash sweep prints nothing", bash(repo, "echo x"));
await check("on: the Bash sweep formats Markdown", () =>
  aligned(`${repo}/SWEPT.md`),
);

fs.writeFileSync(`${repo}/C.md`, RAW);
git(repo, "add", "-A");
git(repo, "commit", "-qm", "docs");
const ran = bash(repo, "git add -A && git commit -m docs");
await check("on: the amend hint names oxfmt and the file", () =>
  assert.match(
    JSON.parse(ran.stdout).hookSpecificOutput.additionalContext,
    /^oxfmt reformatted markdown[\s\S]*C\.md/,
  ),
);

// --- Off again ---

fs.writeFileSync(`${repo}/session.md`, RAW);
const off = spawnSync(process.execPath, [path.join(hook, "command.ts")], {
  input: JSON.stringify({
    cwd: repo,
    tool_input: { file_path: `${repo}/session.md` },
  }),
  env: { ...process.env, AGENT_HOOKS_DISABLE: "lint-code,format-oxfmt" },
});
await check("AGENT_HOOKS_DISABLE that names the hook: nothing runs", () => {
  assert.equal(off.status, 0);
  assert.equal(read(`${repo}/session.md`), RAW);
});

// --- pi.ts and hooks/register.ts, with stubs over the real files ---

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
let piHandler: Handler | undefined;
extension({
  on: (_name: string, handler: Handler) => (piHandler = handler),
} as never);
fs.writeFileSync(`${repo}/pi.md`, RAW);
await check("pi.ts: formats the file of an edit", async () => {
  await piHandler?.(
    { toolName: "edit", input: { path: "pi.md" }, content: [] },
    { cwd: repo },
  );
  aligned(`${repo}/pi.md`);
});

type Hook = (...args: unknown[]) => Promise<unknown>;
let modHook: Hook | undefined;
register(
  ((_event: string, _matcher: unknown, hook: Hook) =>
    (modHook = hook)) as never,
  {} as never,
);
const stub$ = {
  plugin: { root: hook },
  session: { cwd: async () => repo },
  env: { get: async () => undefined },
  fs: {
    stat: async (file: string) => {
      const found = fs.statSync(file);
      return {
        kind: found.isFile() ? "file" : found.isDirectory() ? "dir" : "other",
      };
    },
    read: async (file: string) => fs.readFileSync(file, "utf8"),
  },
  process: {
    run: async (argv: string[], init: { cwd: string }) => {
      const done = spawnSync(argv[0]!, argv.slice(1), {
        cwd: init.cwd,
        encoding: "utf8",
      });
      if (done.error) throw done.error;
      return { exitCode: done.status ?? 1, stdout: done.stdout };
    },
  },
};
fs.writeFileSync(`${repo}/mod.ts`, LONG);
await check("register.ts: formats with the bundled config", async () => {
  const result = { result: "ok", text: "written" };
  assert.equal(
    await modHook?.(
      stub$,
      { tool: "Write", file_path: `${repo}/mod.ts` },
      async () => result,
    ),
    result,
  );
  assert.match(read(`${repo}/mod.ts`), /^ {2}alpha: 1,$/m);
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
