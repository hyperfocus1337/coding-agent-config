/**
 * Self-check for ../core.ts and its adapters: the cases through command.ts
 * in a real git repository, and the pi adapter with a stub. A stand-in tsc
 * on PATH passes or fails, as FAKE_TSC says, and logs each start to FAKE_LOG.
 *
 * Run: node test/check.ts, from the hook directory. Needs git.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import extension from "../pi.ts";
import ompExtension from "../omp.ts";

const hook = path.dirname(path.dirname(new URL(import.meta.url).pathname));

let failures = 0;
async function check(what: string, run: () => void | Promise<void>) {
  try {
    await run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${what}\n  ${(error as Error).message}`);
  }
}

// Under the temp folder, so the global format-staged-files hook skips the
// fixture commits. The real path, because git prints the real root.
const tmp = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "type-check-tsc-test.")),
);
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const bin = `${tmp}/bin`;
write(
  `${bin}/tsc`,
  `#!/bin/sh
echo tsc >>"$FAKE_LOG"
[ "\${FAKE_TSC:-pass}" = fail ] && { echo "tsc error in $PWD"; exit 2; }
exit 0
`,
);
fs.chmodSync(`${bin}/tsc`, 0o755);
const log = `${tmp}/log`;
const started = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "");

const env = {
  ...process.env,
  PATH: `${bin}:${process.env.PATH}`,
  FAKE_LOG: log,
  FAKE_TSC: "fail",
};

/** Runs command.ts on a Stop payload; returns the exit code and output. */
function run(
  cwd: string,
  extra: object = {},
  vars: Record<string, string> = {},
) {
  fs.rmSync(log, { force: true });
  const ran = spawnSync(process.execPath, [`${hook}/command.ts`], {
    input: JSON.stringify({
      hook_event_name: "Stop",
      stop_hook_active: false,
      cwd,
      ...extra,
    }),
    cwd,
    encoding: "utf8",
    env: { ...env, ...vars },
  });
  return { status: ran.status, out: ran.stdout + ran.stderr };
}
async function expect(
  what: string,
  ran: ReturnType<typeof run>,
  status: number,
  ...holds: string[]
) {
  await check(what, () => {
    assert.equal(ran.status, status, ran.out);
    for (const text of holds)
      assert.ok(ran.out.includes(text), `output does not hold '${text}'`);
    if (!holds.length) assert.equal(ran.out, "");
  });
}

const git = (cwd: string, ...args: string[]) => {
  const done = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(done.status, 0, done.stderr);
};
const repo = `${tmp}/repo`;
write(`${repo}/README.md`, "Base.\n");
write(`${repo}/src/old.ts`, "let x = 1;\n");
git(repo, "init", "-q");
git(repo, "add", ".");
git(
  repo,
  "-c",
  "user.name=t",
  "-c",
  "user.email=t@example.com",
  "commit",
  "-qm",
  "base",
);
/** Resets the repository to the base commit, then writes the files. */
function fresh(files: Record<string, string> = {}) {
  git(repo, "reset", "-q", "--hard");
  git(repo, "clean", "-qfdx");
  for (const [name, text] of Object.entries(files))
    write(`${repo}/${name}`, text);
}
const tsconfig = { "tsconfig.json": "{}\n" };
const failed = "Type check failed. Fix the errors above, then stop.";

// --- Checks ---
fresh();
await expect("no change starts no tsc", run(repo), 0);
fresh(tsconfig);
await expect("a new tsconfig.json alone starts no tsc", run(repo), 0);
await check("no .ts change: nothing started", () =>
  assert.equal(started(), ""),
);
fresh({ "src/old.ts": "let x = 2;\n" });
await expect("a .ts file without tsconfig.json starts no tsc", run(repo), 0);
await check("no tsconfig.json: nothing started", () =>
  assert.equal(started(), ""),
);
fresh({ ...tsconfig, "src/old.ts": "let x = 2;\n" });
await expect(
  "a changed .ts file with errors blocks",
  run(repo),
  2,
  `tsc error in ${repo}\n${failed}\n`,
);
for (const name of ["new.tsx", "new.mts", "new.cts"]) {
  fresh({ ...tsconfig, [name]: "" });
  await expect(`an untracked ${name} file starts tsc`, run(repo), 2, failed);
}
fresh({ ...tsconfig, "src/é.ts": "" });
await expect("a path that git quotes still counts", run(repo), 2, failed);
fresh({ ...tsconfig, "src/old.ts": "let x = 2;\n" });
await expect(
  "tsc that passes does not block",
  run(repo, {}, { FAKE_TSC: "pass" }),
  0,
);
await check("tsc that passes: it started", () =>
  assert.equal(started(), "tsc\n"),
);
fresh(tsconfig);
fs.rmSync(`${repo}/src/old.ts`);
await expect("a deleted .ts file starts no tsc", run(repo), 0);
fresh({ ...tsconfig, "a.py": "" });
await expect("a .py file starts no tsc", run(repo), 0);
fresh({ ...tsconfig, "src/old.ts": "let x = 2;\n" });
await expect(
  "tsc runs from the root, not the session folder",
  run(`${repo}/src`),
  2,
  `tsc error in ${repo}\n`,
);

// --- Skips ---
fresh({ ...tsconfig, "src/old.ts": "let x = 2;\n" });
await expect(
  "stop_hook_active lets the stop pass",
  run(repo, { stop_hook_active: true }),
  0,
);
await check("stop_hook_active: nothing started", () =>
  assert.equal(started(), ""),
);
await expect(
  "CLAUDE_HOOKS_DISABLE that names the hook lets the stop pass",
  run(repo, {}, { CLAUDE_HOOKS_DISABLE: "lint-code,type-check-tsc" }),
  0,
);
await check("CLAUDE_HOOKS_DISABLE: nothing started", () =>
  assert.equal(started(), ""),
);
const gitDir = path.dirname(
  spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout,
);
await expect(
  "a missing tsc is skipped",
  run(repo, {}, { PATH: `${gitDir}:/usr/bin:/bin` }),
  0,
);
write(`${tmp}/plain/a.ts`, "");
write(`${tmp}/plain/tsconfig.json`, "{}\n");
await expect("a folder outside git is skipped", run(`${tmp}/plain`), 0);
const first = `${tmp}/first`;
write(`${first}/a.ts`, "");
write(`${first}/tsconfig.json`, "{}\n");
git(first, "init", "-q");
await expect(
  "before the first commit, untracked files count",
  run(first),
  2,
  failed,
);

// --- pi.ts, with a stub ---

const saved = { ...process.env };
Object.assign(process.env, env);
fresh({ ...tsconfig, "src/old.ts": "let x = 2;\n" });

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
let piHandler: Handler | undefined;
const sent: { content: string; options: unknown }[] = [];
extension({
  on: (_name: string, handler: Handler) => (piHandler = handler),
  sendMessage: (message: { content: string }, options: unknown) =>
    sent.push({ content: message.content, options }),
} as never);
const end = (stopReason = "stop", extra: object = {}) =>
  piHandler?.(
    {
      type: "agent_end",
      messages: [{ role: "assistant", stopReason }],
      ...extra,
    },
    { cwd: `${repo}/src` },
  );
await check("pi.ts: sends the errors and starts a run", async () => {
  await end();
  assert.equal(sent.length, 1);
  assert.ok(sent[0]?.content.includes(`tsc error in ${repo}`));
  assert.deepEqual(sent[0]?.options, {
    triggerTurn: true,
    deliverAs: "followUp",
  });
});
await check("pi.ts: the end of that run passes", async () => {
  await end();
  assert.equal(sent.length, 1);
});
await check("pi.ts: the next run is checked again", async () => {
  await end();
  assert.equal(sent.length, 2);
  await end(); // the guard again
});
await check("pi.ts: a stopped or failed run starts nothing", async () => {
  await end("aborted");
  await end("error");
  assert.equal(sent.length, 2);
});

// --- omp.ts, with a stub ---

let ompHandler: Handler | undefined;
const registered: string[] = [];
ompExtension({
  on: (name: string, handler: Handler) => {
    registered.push(name);
    ompHandler = handler;
  },
} as never);
const stop = (stopHookActive = false, stopReason = "stop") =>
  ompHandler?.(
    {
      type: "session_stop",
      stop_hook_active: stopHookActive,
      last_assistant_message: { role: "assistant", stopReason },
    },
    { cwd: `${repo}/src` },
  );
await check("omp.ts: registers session_stop only", () =>
  assert.deepEqual(registered, ["session_stop"]),
);
await check("omp.ts: continues with the errors as context", async () => {
  const result = (await stop()) as {
    continue?: boolean;
    additionalContext?: string;
  };
  assert.equal(result.continue, true);
  assert.ok(result.additionalContext?.includes(`tsc error in ${repo}`));
});
await check("omp.ts: the stop after a continuation passes", async () =>
  assert.equal(await stop(true), undefined),
);
await check("omp.ts: a stopped or failed run starts nothing", async () => {
  assert.equal(await stop(false, "aborted"), undefined);
  assert.equal(await stop(false, "error"), undefined);
});

for (const name of Object.keys(process.env))
  if (!(name in saved)) delete process.env[name];
Object.assign(process.env, saved);
fs.rmSync(tmp, { recursive: true });
if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
