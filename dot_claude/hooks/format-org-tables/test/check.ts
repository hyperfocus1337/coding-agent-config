/**
 * Self-check for ../core.ts and its adapters: the cases of the old test.sh
 * through command.ts with the real git and Emacs, then the pi and mod
 * adapters with stubs over the real files.
 *
 * Run: node test/check.ts, from the hook directory. Fixtures live under $HOME,
 * because the hook skips /tmp and $TMPDIR. Without git or Emacs the hook does
 * nothing, so the check skips with a message instead of passing.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { align } from "../core.ts";
import { register } from "../hooks/register.ts";
import ompExtension from "../omp.ts";
import extension from "../pi.ts";

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

for (const program of ["git", "emacs"])
  if (spawnSync(program, ["--version"]).error) {
    console.log(`SKIP no ${program} on PATH`);
    process.exit(0);
  }

const tmp = fs.mkdtempSync(path.join(os.homedir(), ".org-hook-test."));
// Turn off the format-staged-files pre-commit hook: it aligns the file
// before the commit, and then nothing is left to amend.
const env = {
  ...process.env,
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "hook.claude-format-staged.enabled",
  GIT_CONFIG_VALUE_0: "false",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};
const git = (cwd: string, ...args: string[]) => {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8", env });
  assert.equal(ran.status, 0, `git ${args.join(" ")}: ${ran.stderr}`);
};

/** Runs command.ts with a payload; the timeout turns a hung Emacs into a failure. */
const hookRun = (payload: object) =>
  spawnSync(process.execPath, [path.join(hook, "command.ts")], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env,
    timeout: 60_000,
  });
const bash = (cwd: string, command: string) =>
  hookRun({ cwd, tool_input: { command } });
const edit = (file: string) => hookRun({ tool_input: { file_path: file } });

/** A table Org realigns: cells of unequal width, no padding yet. */
const RAW = "| a | bbbbbbbbbbbb |\n|---+---|\n| ccccccccccccccc | d |\n";
const unaligned = (file: string) => fs.writeFileSync(file, RAW);
const read = (file: string) => fs.readFileSync(file, "utf8");
/** Aligned: the first cell is padded to the width of the widest one. */
const aligned = (what: string, file: string) =>
  check(`align ${what}`, () => assert.match(read(file), /^\| a {2}/));
const untouched = (what: string, file: string) =>
  check(`skip ${what}`, () => assert.match(read(file), /^\| a \| b/));
const quiet = (what: string, ran: ReturnType<typeof hookRun>) =>
  check(what, () => {
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(ran.stdout + ran.stderr, "");
  });

// --- A Write or Edit ---

unaligned(`${tmp}/edit.org`);
await quiet("edit: prints nothing", edit(`${tmp}/edit.org`));
await aligned("the file the payload names", `${tmp}/edit.org`);

unaligned(`${tmp}/not-org.md`);
edit(`${tmp}/not-org.md`);
await untouched("a file that is not .org", `${tmp}/not-org.md`);

await quiet("a file that does not exist", edit(`${tmp}/missing.org`));

const once = read(`${tmp}/edit.org`);
edit(`${tmp}/edit.org`);
await check("align: a second pass changes nothing", () =>
  assert.equal(read(`${tmp}/edit.org`), once),
);

await check("clean: no backup files left behind", () =>
  assert.deepEqual(
    fs.readdirSync(tmp).filter((file) => file.endsWith("~")),
    [],
  ),
);

// A file in a temp folder is a scratch file, not project prose.
const scratch = `${process.env.TMPDIR || "/tmp"}/org-hook-scratch.org`;
unaligned(scratch);
edit(scratch);
await untouched("a file in a temp folder", scratch);
fs.rmSync(scratch);

// A | line inside a block is not a table: org-at-table-p decides.
fs.writeFileSync(
  `${tmp}/block.org`,
  "#+begin_example\n| a | bbbbbbbbbbbb |\n| ccccccccccccccc | d |\n#+end_example\n",
);
edit(`${tmp}/block.org`);
await check("skip a | line inside a block", () =>
  assert.match(read(`${tmp}/block.org`), /^\| a \| b/m),
);

// Alignment only: a TBLFM formula is not evaluated, so the sum stays 0.
fs.writeFileSync(`${tmp}/formula.org`, "| 2 | 3 | 0 |\n#+TBLFM: $3=$1+$2\n");
edit(`${tmp}/formula.org`);
await check("align: a TBLFM formula is not evaluated", () =>
  assert.match(read(`${tmp}/formula.org`), /\| *2 \| *3 \| *0 \|/),
);

// A link counts at its raw width, so each | is at the same column in a diff.
fs.writeFileSync(
  `${tmp}/link.org`,
  "| a | see [[*Cache][Cache]] |\n| b | x |\n",
);
edit(`${tmp}/link.org`);
await check("align: a link counts at its raw width", () => {
  const widths = read(`${tmp}/link.org`)
    .trimEnd()
    .split("\n")
    .map((line) => line.length);
  assert.equal(new Set(widths).size, 1, read(`${tmp}/link.org`));
});

// --- A Bash call ---

const repo = `${tmp}/repo`;
fs.mkdirSync(`${repo}/docs`, { recursive: true });
git(repo, "init", "-q");
unaligned(`${repo}/docs/heredoc.org`);
bash(repo, "cat > docs/heredoc.org <<'EOF'\n| a | b |\nEOF");
await aligned(
  "a relative path, against the payload cwd",
  `${repo}/docs/heredoc.org`,
);

unaligned(`${repo}/one.org`);
unaligned(`${repo}/two.org`);
bash(
  repo,
  `sed -i '' s/x/y/ ${repo}/one.org && sed -i '' s/x/y/ ${repo}/two.org`,
);
await aligned("the first of two files in one command", `${repo}/one.org`);
await aligned("the second of two files in one command", `${repo}/two.org`);

unaligned(`${repo}/prose.md`);
bash(repo, `printf x > ${repo}/prose.md`);
await untouched("a command that names no .org path", `${repo}/prose.md`);

await quiet(
  "a named path that does not exist",
  bash(repo, `rm ${repo}/gone.org`),
);

// Write and commit in one call: the commit holds the unaligned file, so the
// hook names the file in the amend hint.
unaligned(`${repo}/committed.org`);
git(repo, "add", "-A");
git(repo, "commit", "-qm", "seed");
let ran = bash(
  repo,
  `cat > ${repo}/committed.org <<'EOF'\nEOF\ngit commit -am docs`,
);
await aligned("a file the command committed", `${repo}/committed.org`);
await check("hint: names the file", () => {
  const out = JSON.parse(ran.stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /committed\.org/);
});

// A path the command only read stays as it is: its old mtime says so.
unaligned(`${repo}/read-only.org`);
fs.utimesSync(
  `${repo}/read-only.org`,
  new Date(2020, 0, 1),
  new Date(2020, 0, 1),
);
bash(repo, `sed -n '1,2p' ${repo}/read-only.org > ${repo}/copy.org`);
await untouched("a path the command only read", `${repo}/read-only.org`);

// Another session's edit leaves the tree dirty while Emacs changed nothing,
// so there is nothing to amend.
unaligned(`${repo}/settled.org`);
edit(`${repo}/settled.org`);
git(repo, "add", "settled.org");
git(repo, "commit", "-qm", "settled");
fs.appendFileSync(`${repo}/settled.org`, "a line another session wrote\n");
await quiet(
  "hint: none for a file Emacs left as it was",
  bash(repo, `git add ${repo}/settled.org && git commit -m settled`),
);

unaligned(`${repo}/quiet.org`);
ran = bash(repo, `cat > ${repo}/quiet.org <<'EOF'\nEOF`);
await quiet("hint: none without a commit", ran);
await aligned("a file written with no commit", `${repo}/quiet.org`);

// --- CLAUDE_HOOKS_DISABLE ---

await check(
  "CLAUDE_HOOKS_DISABLE that names the hook: nothing runs",
  async () =>
    assert.equal(
      await align(
        { filePath: "/x/a.org", cwd: "/x" },
        new Proxy(
          {},
          { get: () => () => assert.fail("the hook ran") },
        ) as never,
        {
          hooksOff: "lint-code format-org-tables",
        },
      ),
      undefined,
    ),
);

// --- pi.ts and hooks/register.ts, with stubs over the real files ---

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
let piHandler: Handler | undefined;
extension({
  on: (_name: string, handler: Handler) => (piHandler = handler),
} as never);
unaligned(`${repo}/pi.org`);
await check("pi.ts: aligns the file of an edit", async () => {
  const result = await piHandler?.(
    { toolName: "edit", input: { path: "pi.org" }, content: [] },
    { cwd: repo },
  );
  assert.equal(result, undefined);
  assert.match(read(`${repo}/pi.org`), /^\| a {2}/);
});
unaligned(`${repo}/pi-commit.org`);
git(repo, "add", "-A");
git(repo, "commit", "-qm", "pi");
await check("pi.ts: appends the amend hint to the result", async () => {
  const content = [{ type: "text", text: "committed" }];
  const result = (await piHandler?.(
    {
      toolName: "bash",
      input: { command: `touch pi-commit.org && git commit -am pi` },
      content,
    },
    { cwd: repo },
  )) as { content: { text: string }[] };
  assert.equal(result.content[0]?.text, "committed");
  assert.match(result.content[1]?.text ?? "", /pi-commit\.org/);
});

let ompHandler: Handler | undefined;
ompExtension({
  on: (_name: string, handler: Handler) => (ompHandler = handler),
} as never);
const omp = (toolName: string, input: object, details?: object) =>
  ompHandler?.({ toolName, input, details, content: [] }, { cwd: repo });
await check("omp.ts: aligns each file of a multi-file edit", async () => {
  unaligned(`${repo}/omp-a.org`);
  unaligned(`${repo}/omp-b.org`);
  await omp("edit", { paths: ["omp-a.org", "omp-b.org"] });
  assert.match(read(`${repo}/omp-a.org`), /^\| a {2}/);
  assert.match(read(`${repo}/omp-b.org`), /^\| a {2}/);
});
await check("omp.ts: aligns the files of an applied ast_edit", async () => {
  unaligned(`${repo}/omp-ast.org`);
  await omp(
    "write",
    { path: "xd://resolve" },
    {
      xdev: {
        tool: "resolve",
        inner: {
          action: "apply",
          sourceToolName: "ast_edit",
          sourceResultDetails: { applied: true, files: ["omp-ast.org"] },
        },
      },
    },
  );
  assert.match(read(`${repo}/omp-ast.org`), /^\| a {2}/);
});
await check("omp.ts: leaves the calls of pi.ts alone", async () => {
  unaligned(`${repo}/omp-pi.org`);
  await omp("write", { path: "omp-pi.org" });
  assert.equal(read(`${repo}/omp-pi.org`), RAW);
});

type Hook = (...args: unknown[]) => Promise<unknown>;
let modHook: Hook | undefined;
register(
  ((_event: string, _matcher: unknown, hook: Hook) =>
    (modHook = hook)) as never,
  {} as never,
);
const stub$ = {
  session: { cwd: async () => repo },
  env: { get: async () => undefined },
  fs: {
    stat: async (file: string) => {
      const found = fs.statSync(file);
      return {
        kind: found.isFile() ? "file" : found.isDirectory() ? "dir" : "other",
        mtimeMs: found.mtimeMs,
      };
    },
    read: async (file: string) => fs.readFileSync(file, "utf8"),
  },
  process: {
    run: async (
      argv: string[],
      init: { cwd: string; env?: Record<string, string> },
    ) => {
      const done = spawnSync(argv[0]!, argv.slice(1), {
        cwd: init.cwd,
        env: { ...env, ...init.env },
        encoding: "utf8",
      });
      if (done.error) throw done.error;
      return {
        exitCode: done.status ?? 1,
        stdout: done.stdout,
        stderr: done.stderr,
      };
    },
  },
};
const result = { result: "ok", text: "written" };
unaligned(`${repo}/mod.org`);
await check("register.ts: aligns the file and passes the result", async () => {
  assert.equal(
    await modHook?.(
      stub$,
      { tool: "Write", file_path: `${repo}/mod.org` },
      async () => result,
    ),
    result,
  );
  assert.match(read(`${repo}/mod.org`), /^\| a {2}/);
});
unaligned(`${repo}/mod-commit.org`);
git(repo, "add", "-A");
git(repo, "commit", "-qm", "mod");
await check("register.ts: adds the amend hint as context", async () => {
  const done = (await modHook?.(
    stub$,
    { tool: "Bash", command: `touch mod-commit.org && git commit -am mod` },
    async () => result,
  )) as { text: string; context: string[] };
  assert.equal(done.text, "written");
  assert.match(done.context[0] ?? "", /mod-commit\.org/);
});
await check("register.ts: passes a deny through", async () => {
  const denied = { deny: "no" };
  assert.equal(
    await modHook?.(stub$, { tool: "Bash", command: "x" }, async () => denied),
    denied,
  );
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
