/**
 * Self-check for ../core.ts and its adapters: the cases of the old test.sh
 * through command.ts with the real git and Prettier, then the pi and mod
 * adapters with stubs over the real files.
 *
 * Run: node test/check.ts, from the hook directory. Fixtures live under $HOME,
 * because the hook skips /tmp and $TMPDIR. Without git or Prettier the hook
 * does nothing, so the check skips with a message instead of passing.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { format } from "../core.ts";
import { register } from "../hooks/register.ts";
import ompExtension from "../omp.ts";
import extension from "../pi.ts";

const hook = path.dirname(import.meta.dirname);
// A hook that /toggle-hook turned off in the agent that runs this check
// still runs here.
delete process.env.CLAUDE_HOOKS_DISABLE;

let failures = 0;
async function check(what: string, run: () => void | Promise<void>) {
  try {
    await run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${what}\n  ${(error as Error).message}`);
  }
}

for (const program of ["git", "prettier"])
  if (spawnSync(program, ["--version"]).error) {
    console.log(`SKIP no ${program} on PATH`);
    process.exit(0);
  }

const tmp = fs.mkdtempSync(path.join(os.homedir(), ".format-hook-test."));
// Turn off the format-staged-files pre-commit hook: it formats the file
// before the commit, and then nothing is left to amend.
Object.assign(process.env, {
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
const bash = (cwd: string, command: string, extra: object = {}) =>
  hookRun({ cwd, tool_input: { command }, ...extra });
const edit = (file: string) => hookRun({ tool_input: { file_path: file } });

/** A table Prettier realigns: cells of unequal width, no padding yet. */
const RAW = "| a | bbbbbbbbbbbb |\n| --- | --- |\n| ccccccccccccccc | d |\n";
const unaligned = (file: string) => fs.writeFileSync(file, RAW);
const read = (file: string) => fs.readFileSync(file, "utf8");
const aligned = (file: string) => assert.match(read(file), /^\| a {2}/);
const formatted = (what: string, file: string) =>
  check(`format ${what}`, () => aligned(file));
const unchanged = (what: string, file: string, text: string) =>
  check(`skip ${what}`, () => assert.equal(read(file), text));
const quiet = (what: string, ran: ReturnType<typeof hookRun>) =>
  check(what, () => {
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(ran.stdout + ran.stderr, "");
  });
const hint = (
  ran: ReturnType<typeof hookRun>,
): { hookEventName: string; additionalContext: string } | undefined =>
  ran.stdout ? JSON.parse(ran.stdout).hookSpecificOutput : undefined;

// --- The Bash sweep ---

// Fixture: outer repo, a plain subdir, an embedded repo, an embedded repo
// inside that one, a worktree, and a submodule made dirty by an extra row.
const sub = `${tmp}/sub`;
fs.mkdirSync(sub);
git(sub, "init", "-q");
unaligned(`${sub}/SUB.md`);
git(sub, "add", "-A");
git(sub, "commit", "-qm", "seed");

const outer = `${tmp}/outer`;
fs.mkdirSync(`${outer}/plain`, { recursive: true });
fs.mkdirSync(`${outer}/nested/deeper`, { recursive: true });
git(outer, "init", "-q");
git(outer, "commit", "-q", "--allow-empty", "-m", "seed");
git(
  outer,
  "-c",
  "protocol.file.allow=always",
  "submodule",
  "add",
  "-q",
  sub,
  "submod",
);
git(outer, "commit", "-qm", "submod");
git(`${outer}/nested`, "init", "-q");
git(`${outer}/nested/deeper`, "init", "-q");
git(outer, "worktree", "add", "-q", `${outer}/.worktrees/feat`, "-b", "feat");
for (const file of [
  "OUTER.md",
  "plain/P.md",
  "nested/NESTED.md",
  "nested/deeper/DEEP.md",
  ".worktrees/feat/WT.md",
])
  unaligned(`${outer}/${file}`);
fs.writeFileSync(`${outer}/submod/SUB.md`, `${RAW}| e | f |\n`);
// Non-Markdown the sweep must leave alone, ignored Markdown it must not see,
// and a symlink back to a root, which the queue must not follow forever.
fs.writeFileSync(`${outer}/code.ts`, "const a  =  1\n");
fs.writeFileSync(`${outer}/data.json`, '{"a":1,   "b":2}\n');
fs.mkdirSync(`${outer}/vendor`);
fs.writeFileSync(`${outer}/.gitignore`, "vendor/\n");
unaligned(`${outer}/vendor/V.md`);
fs.symlinkSync(".", `${outer}/self`);
// A table whose padded width passes 80 columns, and one sentence per line:
// under --prose-wrap never, the table compacts and the sentences join.
fs.writeFileSync(
  `${outer}/WIDE.md`,
  "| first-column-heading-here | second-column-heading-x | third-column-heading-yz |\n| --- | --- | --- |\n| first-column-cell-value | second-column-cell-value | third-column-cell-value |\n\nThe first sentence stays on its own line.\nThe second sentence also stays on its own line.\n",
);

// The command names no path, so only the queue finds the roots.
await quiet("sweep: ends with a symlink back to a root", bash(outer, "echo x"));
await formatted("root", `${outer}/OUTER.md`);
await formatted("plain subdir", `${outer}/plain/P.md`);
await formatted("embedded repo", `${outer}/nested/NESTED.md`);
await formatted("embedded repo at depth 2", `${outer}/nested/deeper/DEEP.md`);
await formatted("dirty submodule", `${outer}/submod/SUB.md`);
await formatted("worktree in the repo", `${outer}/.worktrees/feat/WT.md`);
await unchanged("sweep leaves .ts", `${outer}/code.ts`, "const a  =  1\n");
await unchanged(
  "sweep leaves .json",
  `${outer}/data.json`,
  '{"a":1,   "b":2}\n',
);
await unchanged("ignored Markdown", `${outer}/vendor/V.md`, RAW);
await check("prose wrap: a wide table stays padded", () =>
  assert.match(read(`${outer}/WIDE.md`), /^\| -{8}/m),
);
await check("prose wrap: sentence lines are kept", () =>
  assert.match(
    read(`${outer}/WIDE.md`),
    /^The second sentence also stays on its own line\.$/m,
  ),
);

// A repo with no commits has no HEAD, so `git diff HEAD` fails. Untracked
// Markdown must still be swept, with no git error on the output.
const fresh = `${tmp}/fresh`;
fs.mkdirSync(fresh);
git(fresh, "init", "-q");
unaligned(`${fresh}/NEW.md`);
await quiet("no-HEAD repo: prints nothing", bash(fresh, "echo x"));
await formatted("repo with no HEAD", `${fresh}/NEW.md`);

// A cwd outside any repo exits clean, and a file the command names still
// formats.
fs.mkdirSync(`${tmp}/norepo`);
unaligned(`${tmp}/norepo/N.md`);
await quiet("non-repo cwd", bash(`${tmp}/norepo`, "cat > N.md <<EOF\nx\nEOF"));
await formatted("named file outside any repo", `${tmp}/norepo/N.md`);

// A Markdown file in a second repo, reached only by an absolute path.
const other = `${tmp}/other`;
fs.mkdirSync(other);
git(other, "init", "-q");
git(other, "commit", "-q", "--allow-empty", "-m", "seed");
unaligned(`${other}/OTHER.md`);
await quiet(
  "cross-repo sweep",
  bash(outer, `cat > ${other}/OTHER.md <<EOF\nx\nEOF`),
);
await formatted("cross-repo absolute path", `${other}/OTHER.md`);

// Only an absolute path is a root: the end of a relative path is not.
await check("sweep: no git start for a relative path", async () => {
  const dirs: string[] = [];
  await format(
    { command: "cat docs/a.md /abs/b.md > out/c.md", cwd: "/repo" },
    {
      stat: async (path) => (path === "/repo" ? { kind: "dir" } : undefined),
      read: async () => undefined,
      run: async (argv, { cwd }) => {
        if (argv[1] === "rev-parse") dirs.push(cwd);
        return { exitCode: 1, stdout: "" };
      },
    },
    {},
  );
  assert.deepEqual(dirs, ["/repo", "/abs"]);
});

// A named file is formatted even when git cannot see it: a file written and
// ignored in the same call is already ignored when the hook runs.
unaligned(`${outer}/vendor/NAMED.md`);
bash(outer, "cat > vendor/NAMED.md <<EOF\nx\nEOF");
await formatted(
  "ignored file named in the command",
  `${outer}/vendor/NAMED.md`,
);

// .prettierignore still wins: that one is a formatting decision.
fs.writeFileSync(`${outer}/.prettierignore`, "PIGNORED.md\n");
unaligned(`${outer}/PIGNORED.md`);
bash(outer, "cat > PIGNORED.md <<EOF\nx\nEOF");
await unchanged("file in .prettierignore", `${outer}/PIGNORED.md`, RAW);

unaligned(`${outer}/vendor/REL.md`);
bash(outer, "sed -i s/a/b/ vendor/REL.md");
await formatted("relative path named in the command", `${outer}/vendor/REL.md`);

await quiet("a named path that does not exist", bash(outer, "rm gone.md"));

// Write and commit in one call leaves a clean tree. With `git commit` in the
// command, the sweep also covers the last commit and gives the amend hint.
const committed = `${tmp}/committed`;
fs.mkdirSync(committed);
git(committed, "init", "-q");
git(committed, "commit", "-q", "--allow-empty", "-m", "seed");
unaligned(`${committed}/C.md`);
git(committed, "add", "-A");
git(committed, "commit", "-qm", "docs");
let ran = bash(committed, "git add -A && git commit -m docs && git push");
await formatted("file committed in the same command", `${committed}/C.md`);
await check("hint: amend hint after a commit sweep", () => {
  assert.match(hint(ran)?.additionalContext ?? "", /amend/);
  assert.match(hint(ran)?.additionalContext ?? "", /C\.md/);
});

// `git -C <dir> commit` also commits, so the sweep covers the last commit.
unaligned(`${committed}/G.md`);
git(committed, "add", "-A");
git(committed, "commit", "-qm", "dash-c");
ran = bash(committed, `git -C ${committed} commit -m dash-c`);
await check("hint: also after git -C <dir> commit", () =>
  assert.match(hint(ran)?.additionalContext ?? "", /G\.md/),
);

// The failure event: the hint names the event that fired.
unaligned(`${committed}/F.md`);
git(committed, "add", "-A");
git(committed, "commit", "-qm", "more");
ran = bash(committed, "git add -A && git commit -m more && just fmt-check", {
  hook_event_name: "PostToolUseFailure",
  error: "exit 1",
});
await formatted(
  "file committed by a command that then failed",
  `${committed}/F.md`,
);
await check("hint: names the event that fired", () =>
  assert.equal(hint(ran)?.hookEventName, "PostToolUseFailure"),
);

unaligned(`${committed}/D.md`);
await quiet("hint: none without a commit", bash(committed, "echo x"));

// An uncommitted file the sweep formats is not named: an amend would not fix it.
git(committed, "commit", "-q", "--allow-empty", "-m", "other");
unaligned(`${committed}/E.md`);
ran = bash(committed, "git commit -m other");
await formatted("uncommitted file in a commit sweep", `${committed}/E.md`);
await quiet("hint: none for a file the commit does not hold", ran);

// A commit whose Markdown Prettier leaves as it is needs no amend.
git(committed, "add", "-A");
git(committed, "commit", "-qm", "formatted");
await quiet(
  "hint: none when Prettier changed nothing",
  bash(committed, "git commit -m formatted"),
);

// A repo with one commit has no HEAD~1, and the hint still comes.
const first = `${tmp}/first`;
fs.mkdirSync(first);
git(first, "init", "-q");
unaligned(`${first}/R.md`);
git(first, "add", "-A");
git(first, "commit", "-qm", "root");
ran = bash(first, "git add -A && git commit -m root");
await check("hint: also for the first commit of a repo", () =>
  assert.match(hint(ran)?.additionalContext ?? "", /R\.md/),
);

// --- A Write or Edit: one named file, by extension ---

for (const name of ["edited.ts", "edited.mts", "edited.cts"]) {
  fs.writeFileSync(`${outer}/${name}`, "const a  =  1\n");
  await quiet(`edit ${name}: prints nothing`, edit(`${outer}/${name}`));
  await unchanged(`edit formats ${name}`, `${outer}/${name}`, "const a = 1;\n");
}
for (const [name, text] of [
  ["notes.org", "| a | bbbb |\n"],
  ["script.py", "x  =  1\n"],
] as const) {
  fs.writeFileSync(`${outer}/${name}`, text);
  edit(`${outer}/${name}`);
  await unchanged(`edit leaves ${name}`, `${outer}/${name}`, text);
}
// A file in a temp folder is a scratch file, not project code.
const scratch = `${process.env.TMPDIR || "/tmp"}/format-hook-scratch.md`;
unaligned(scratch);
edit(scratch);
await unchanged("edit leaves a temp file", scratch, RAW);
fs.rmSync(scratch);
await quiet("edit: a file that does not exist", edit(`${outer}/gone.md`));

// --- CLAUDE_HOOKS_DISABLE ---

await check(
  "CLAUDE_HOOKS_DISABLE that names the hook: nothing runs",
  async () =>
    assert.equal(
      await format(
        { filePath: "/x/a.md", cwd: "/x" },
        new Proxy(
          {},
          { get: () => () => assert.fail("the hook ran") },
        ) as never,
        {
          hooksOff: "lint-code format-prettier",
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
unaligned(`${outer}/pi.md`);
await check("pi.ts: formats the file of an edit", async () => {
  const result = await piHandler?.(
    { toolName: "edit", input: { path: "pi.md" }, content: [] },
    { cwd: outer },
  );
  assert.equal(result, undefined);
  aligned(`${outer}/pi.md`);
});
unaligned(`${committed}/PI.md`);
git(committed, "add", "-A");
git(committed, "commit", "-qm", "pi");
await check("pi.ts: appends the amend hint to the result", async () => {
  const content = [{ type: "text", text: "committed" }];
  const result = (await piHandler?.(
    { toolName: "bash", input: { command: "git commit -am pi" }, content },
    { cwd: committed },
  )) as { content: { text: string }[] };
  assert.equal(result.content[0]?.text, "committed");
  assert.match(
    result.content[1]?.text ?? "",
    /amend[\s\S]*PI\.md|PI\.md[\s\S]*amend/,
  );
});
await check("pi.ts: leaves other tools alone", async () => {
  unaligned(`${outer}/read.md`);
  await piHandler?.(
    { toolName: "read", input: { path: "read.md" }, content: [] },
    { cwd: outer },
  );
  assert.equal(read(`${outer}/read.md`), RAW);
});

let ompHandler: Handler | undefined;
ompExtension({
  on: (_name: string, handler: Handler) => (ompHandler = handler),
} as never);
const omp = (toolName: string, input: object, details?: object) =>
  ompHandler?.({ toolName, input, details, content: [] }, { cwd: outer });
await check("omp.ts: formats each file of a multi-file edit", async () => {
  unaligned(`${outer}/omp-a.md`);
  unaligned(`${outer}/omp-b.md`);
  await omp("edit", { paths: ["omp-a.md", "omp-b.md"] });
  aligned(`${outer}/omp-a.md`);
  aligned(`${outer}/omp-b.md`);
});
await check("omp.ts: formats the files of an applied ast_edit", async () => {
  unaligned(`${outer}/omp-ast.md`);
  await omp(
    "write",
    { path: "xd://resolve" },
    {
      xdev: {
        tool: "resolve",
        inner: {
          action: "apply",
          sourceToolName: "ast_edit",
          sourceResultDetails: { applied: true, files: ["omp-ast.md"] },
        },
      },
    },
  );
  aligned(`${outer}/omp-ast.md`);
});
await check("omp.ts: leaves the calls of pi.ts alone", async () => {
  unaligned(`${outer}/omp-pi.md`);
  await omp("write", { path: "omp-pi.md" });
  assert.equal(read(`${outer}/omp-pi.md`), RAW);
});

type Hook = (...args: unknown[]) => Promise<unknown>;
let modHook: Hook | undefined;
register(
  ((_event: string, _matcher: unknown, hook: Hook) =>
    (modHook = hook)) as never,
  {} as never,
);
const stub$ = (cwd: string) => ({
  session: { cwd: async () => cwd },
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
});
const result = { result: "ok", text: "written" };
unaligned(`${outer}/mod.md`);
await check("register.ts: formats the file and passes the result", async () => {
  assert.equal(
    await modHook?.(
      stub$(outer),
      { tool: "Write", file_path: `${outer}/mod.md` },
      async () => result,
    ),
    result,
  );
  aligned(`${outer}/mod.md`);
});
unaligned(`${committed}/MOD.md`);
git(committed, "add", "-A");
git(committed, "commit", "-qm", "mod");
await check("register.ts: adds the amend hint as context", async () => {
  const done = (await modHook?.(
    stub$(committed),
    { tool: "Bash", command: "git commit -am mod" },
    async () => result,
  )) as { text: string; context: string[] };
  assert.equal(done.text, "written");
  assert.match(done.context[0] ?? "", /MOD\.md/);
});
await check("register.ts: passes a deny through", async () => {
  const denied = { deny: "no" };
  assert.equal(
    await modHook?.(
      stub$(outer),
      { tool: "Bash", command: "x" },
      async () => denied,
    ),
    denied,
  );
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
