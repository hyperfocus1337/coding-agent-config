/**
 * Self-check for ../core.ts, the checkers, and the adapters: the cases through command.ts in a
 * real git repository, and pi.ts and omp.ts with stubs. A stand-in tsc and pyrefly on PATH pass
 * or fail, as FAKE_TSC and FAKE_PYREFLY say, and log each start to FAKE_LOG.
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
import { nodeIo } from "../io.ts";

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

// Under the temp folder, so the global format-staged-files hook skips the
// fixture commits. The real path, because git prints the real root.
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "type-check-code-test.")));
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const bin = `${tmp}/bin`;
const missingImports =
  "ERROR app/main.py:1:8: Could not find import of `app.settings` [missing-import]\n" +
  "ERROR app/main.py:2:8: Could not find import of `fastapi` [missing-import]\n";
write(`${tmp}/missing-imports.txt`, missingImports);
write(
  `${bin}/tsc`,
  `#!/bin/sh
echo tsc >>"$FAKE_LOG"
case "\${FAKE_TSC:-pass}" in
fail) echo "tsc error in $PWD"; exit 2 ;;
slow) sleep 1; echo "tsc end" >>"$FAKE_LOG"; echo "tsc error in $PWD"; exit 2 ;;
esac
exit 0
`,
);
// With FAKE_TSC=slow, tsc logs its end 1 s after its start, so pyrefly logs its start before
// that end only when the checkers run in parallel.
write(
  `${bin}/pyrefly`,
  `#!/bin/sh
echo pyrefly >>"$FAKE_LOG"
case "\${FAKE_PYREFLY:-pass}" in
fail) echo "pyrefly error in $PWD"; exit 1 ;;
missing) cat "$FAKE_MISSING_IMPORTS" >&2; exit 1 ;;
nomatch) echo " WARN No Python files matched pattern(s)" >&2; exit 1 ;;
esac
exit 0
`,
);
fs.chmodSync(`${bin}/tsc`, 0o755);
fs.chmodSync(`${bin}/pyrefly`, 0o755);
const log = `${tmp}/log`;
const started = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "");

const env = {
  ...process.env,
  PATH: `${bin}:${process.env.PATH}`,
  FAKE_LOG: log,
  FAKE_MISSING_IMPORTS: `${tmp}/missing-imports.txt`,
  FAKE_TSC: "fail",
  FAKE_PYREFLY: "fail",
};

/** Runs command.ts on a Stop payload; returns the exit code and output. */
function run(cwd: string, extra: object = {}, vars: Record<string, string> = {}) {
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
    for (const text of holds) assert.ok(ran.out.includes(text), `output does not hold '${text}'`);
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
write(`${repo}/src/old.py`, "x = 1\n");
git(repo, "init", "-q");
git(repo, "add", ".");
git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "base");
/** Resets the repository to the base commit, then writes the files. */
function fresh(files: Record<string, string> = {}) {
  git(repo, "reset", "-q", "--hard");
  git(repo, "clean", "-qfdx");
  for (const [name, text] of Object.entries(files)) write(`${repo}/${name}`, text);
}
const tsconfig = { "tsconfig.json": "{}\n" };
const editedTs = { ...tsconfig, "src/old.ts": "let x = 2;\n" };
const editedPy = { "src/old.py": "x = 2\n" };
const tscFailed =
  "Type check failed. Fix the errors above, rerun the relevant checks, then stop. Report any remaining failures.";
const pyreflyFailed =
  "Type check failed. For missing imports, first verify the project configuration, import roots, and Python environment used by Pyrefly before changing imports. Use the project's existing dependency and environment setup. Do not suppress diagnostics or weaken checking to obtain a pass. Fix the cause, rerun the check, then stop. Report any remaining failures.";

// Both stand-ins fail by default, so exit 0 with no output also means that no checker started.

// --- tsc ---
fresh();
await expect("no change starts no checker", run(repo), 0);
fresh({ ...tsconfig, "a.md": "" });
await expect("a change with no .ts or .py file starts no checker", run(repo), 0);
fresh({ "src/old.ts": "let x = 2;\n" });
await expect("a .ts file without tsconfig.json starts no tsc", run(repo), 0);
fresh(editedTs);
await expect(
  "a changed .ts file with errors blocks",
  run(repo),
  2,
  `tsc error in ${repo}\n${tscFailed}\n`,
);
await check("a changed .ts file starts tsc only", () => assert.equal(started(), "tsc\n"));
for (const name of ["new.tsx", "new.mts", "new.cts", "types.d.ts"]) {
  fresh({ ...tsconfig, [name]: "" });
  await expect(`an untracked ${name} file starts tsc`, run(repo), 2, tscFailed);
}
fresh({ ...tsconfig, "src/é.ts": "" });
await expect("a path that git quotes still counts for tsc", run(repo), 2, tscFailed);
fresh(editedTs);
await expect("tsc that passes does not block", run(repo, {}, { FAKE_TSC: "pass" }), 0);
await check("tsc that passes: it started", () => assert.equal(started(), "tsc\n"));
fresh(tsconfig);
fs.rmSync(`${repo}/src/old.ts`);
await expect("a deleted .ts file starts no tsc", run(repo), 0);
fresh(editedTs);
await expect(
  "tsc runs from the root, not the session folder",
  run(`${repo}/src`),
  2,
  `tsc error in ${repo}\n`,
);

// --- pyrefly ---
fresh(editedPy);
await expect(
  "a changed .py file with errors blocks",
  run(repo),
  2,
  `pyrefly error in ${repo}\n${pyreflyFailed}\n`,
);
await check("a changed .py file starts pyrefly only", () => assert.equal(started(), "pyrefly\n"));
await check("missing imports preserve diagnostics and give setup guidance", () => {
  const ran = run(repo, {}, { FAKE_PYREFLY: "missing" });
  assert.equal(ran.status, 2);
  assert.equal(ran.out, `${missingImports}${pyreflyFailed}\n`);
});
fresh({ "new.py": "y = 1\n" });
await expect("an untracked .py file starts pyrefly", run(repo), 2, pyreflyFailed);
fresh({ "src/é.py": "y = 1\n" });
await expect("a path that git quotes still counts for pyrefly", run(repo), 2, pyreflyFailed);
fresh(editedPy);
await expect("pyrefly that passes does not block", run(repo, {}, { FAKE_PYREFLY: "pass" }), 0);
await check("pyrefly that passes: it started", () => assert.equal(started(), "pyrefly\n"));
await expect(
  "pyrefly that matches no files does not block",
  run(repo, {}, { FAKE_PYREFLY: "nomatch" }),
  0,
);
fresh();
fs.rmSync(`${repo}/src/old.py`);
await expect("a deleted .py file starts no pyrefly", run(repo), 0);
fresh(editedPy);
await expect(
  "pyrefly runs from the root, not the session folder",
  run(`${repo}/src`),
  2,
  `pyrefly error in ${repo}\n`,
);

// --- Both ---
fresh({ ...editedTs, ...editedPy });
await expect(
  "both checkers report, tsc first",
  run(repo),
  2,
  `tsc error in ${repo}\n${tscFailed}\npyrefly error in ${repo}\n${pyreflyFailed}\n`,
);
await expect(
  "a checker that passes leaves the errors of the other",
  run(repo, {}, { FAKE_TSC: "pass" }),
  2,
  `pyrefly error in ${repo}\n${pyreflyFailed}\n`,
);
await check("the checkers run in parallel", () => {
  const ran = run(repo, {}, { FAKE_TSC: "slow" });
  assert.equal(ran.status, 2, ran.out);
  // Either checker can start first. In sequence, pyrefly would start after "tsc end".
  const lines = started().trim().split("\n");
  assert.deepEqual([lines.slice(0, 2).sort(), lines[2]], [["pyrefly", "tsc"], "tsc end"]);
});

// --- Skips ---
await expect("stop_hook_active lets the stop pass", run(repo, { stop_hook_active: true }), 0);
await expect(
  "AGENT_HOOKS_DISABLE that names the hook lets the stop pass",
  run(repo, {}, { AGENT_HOOKS_DISABLE: "lint-code,type-check-code" }),
  0,
);
await expect(
  "AGENT_HOOKS_DISABLE that names one checker skips only that checker",
  run(repo, {}, { AGENT_HOOKS_DISABLE: "lint-code type-check-code.tsc" }),
  2,
  `pyrefly error in ${repo}\n${pyreflyFailed}\n`,
);
await check("AGENT_HOOKS_DISABLE that names one checker: the other starts", () =>
  assert.equal(started(), "pyrefly\n"),
);
git(repo, "config", "agent-hook.type-check-code.enabled", "false");
await expect("git config that turns the hook off lets the stop pass", run(repo), 0);
git(repo, "config", "--unset", "agent-hook.type-check-code.enabled");
git(repo, "config", "agent-hook.type-check-code.pyrefly", "false");
await expect(
  "git config that turns one checker off skips only that checker",
  run(repo),
  2,
  `tsc error in ${repo}\n${tscFailed}\n`,
);
git(repo, "config", "agent-hook.type-check-code.pyrefly", "banana");
await expect("a value that is not a boolean keeps the checker on", run(repo), 2, pyreflyFailed);
git(repo, "config", "--unset", "agent-hook.type-check-code.pyrefly");
const gitDir = process.env.PATH?.split(":").find((dir) => fs.existsSync(`${dir}/git`));
await expect("missing checkers are skipped", run(repo, {}, { PATH: `${gitDir}:/usr/bin:/bin` }), 0);
write(`${tmp}/plain/a.ts`, "");
write(`${tmp}/plain/a.py`, "x = 1\n");
write(`${tmp}/plain/tsconfig.json`, "{}\n");
await expect("a folder outside git is skipped", run(`${tmp}/plain`), 0);
const first = `${tmp}/first`;
write(`${first}/a.ts`, "");
write(`${first}/tsconfig.json`, "{}\n");
git(first, "init", "-q");
await expect("before the first commit, untracked files count", run(first), 2, tscFailed);

// --- pi.ts, with a stub ---

Object.assign(process.env, env);
fresh(editedTs);

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
const piHandlers = new Map<string, Handler>();
extension({
  on: (name: string, handler: Handler) => piHandlers.set(name, handler),
} as never);
const prior = {
  type: "custom_message",
  customType: "other",
  content: "earlier errors",
  display: true,
};
const end = (outcome = "completed") =>
  piHandlers.get("agent_before_settle")?.(
    { type: "agent_before_settle", outcome, entries: [prior], continue: true },
    { cwd: `${repo}/src` },
  );
await check("pi.ts: checks at settlement and preserves earlier findings", async () => {
  assert.deepEqual([...piHandlers.keys()].sort(), ["agent_before_settle", "agent_settled"]);
  const result = (await end()) as {
    continue: boolean;
    entries: { customType: string; content: string }[];
  };
  assert.equal(result.continue, true);
  assert.equal(result.entries[0], prior);
  assert.equal(result.entries[1]?.customType, "type-check-code");
  assert.ok(result.entries[1]?.content.includes(`tsc error in ${repo}`));
});
await check("pi.ts: correction boundaries do not check again", async () => {
  assert.equal(await end(), undefined);
  assert.equal(await end(), undefined);
});
await check("pi.ts: settlement resets the guard", async () => {
  await piHandlers.get("agent_settled")?.({}, {});
  assert.ok(await end());
  await piHandlers.get("agent_settled")?.({}, {});
});
await check("pi.ts: a stopped or failed run starts nothing", async () => {
  assert.equal(await end("aborted"), undefined);
  assert.equal(await end("error"), undefined);
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

// --- io.ts ---

await check("io.ts: a character split across two chunks stays whole", async () => {
  // The two bytes of é, written 50 ms apart, arrive as two chunks.
  const script =
    "process.stdout.write(Buffer.from([0xc3]));" +
    "setTimeout(() => process.stdout.write(Buffer.from([0xa9])), 50);";
  const ran = await nodeIo().run([process.execPath, "-e", script], tmp);
  assert.equal(ran?.stdout, "é");
});

fs.rmSync(tmp, { recursive: true });
if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
