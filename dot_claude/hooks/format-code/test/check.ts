/**
 * Self-check for ../core.ts and its adapters: the cases through command.ts
 * with the real git, terraform, and shfmt, then the pi and mod adapters with
 * stubs over the real files.
 *
 * Run: node test/check.ts, from the hook directory. Fixtures live under $HOME,
 * because the hook skips /tmp and $TMPDIR. Without git, terraform, or shfmt
 * the hook does nothing, so the check skips with a message instead of
 * passing.
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

const hook = path.dirname(path.dirname(new URL(import.meta.url).pathname));
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

for (const program of ["git", "terraform", "shfmt"])
  if (spawnSync(program, ["--version"]).error) {
    console.log(`SKIP no ${program} on PATH`);
    process.exit(0);
  }

const tmp = fs.mkdtempSync(path.join(os.homedir(), ".format-code-test."));
// Turn off the format-staged-files pre-commit hook: it formats the file
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

/** Runs command.ts with a payload. */
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

/** Terraform that terraform fmt changes: the `=` signs are not aligned. */
const RAW = "a   = 1\nbb = 2\n";
const FORMATTED = "a  = 1\nbb = 2\n";
const unformatted = (file: string) => fs.writeFileSync(file, RAW);
const read = (file: string) => fs.readFileSync(file, "utf8");
const formatted = (what: string, file: string) =>
  check(`format ${what}`, () => assert.equal(read(file), FORMATTED));
const untouched = (what: string, file: string) =>
  check(`skip ${what}`, () => assert.equal(read(file), RAW));
const quiet = (what: string, ran: ReturnType<typeof hookRun>) =>
  check(what, () => {
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(ran.stdout + ran.stderr, "");
  });

// --- A Write or Edit ---

unformatted(`${tmp}/edit.tf`);
await quiet("edit: prints nothing", edit(`${tmp}/edit.tf`));
await formatted("the .tf file the payload names", `${tmp}/edit.tf`);

unformatted(`${tmp}/edit.tfvars`);
edit(`${tmp}/edit.tfvars`);
await formatted("a .tfvars file", `${tmp}/edit.tfvars`);

unformatted(`${tmp}/not-tf.md`);
edit(`${tmp}/not-tf.md`);
await untouched("a file that is not Terraform", `${tmp}/not-tf.md`);

await quiet("a file that does not exist", edit(`${tmp}/missing.tf`));

fs.writeFileSync(`${tmp}/bad.tf`, "a   = {\n");
await quiet("a file that does not parse", edit(`${tmp}/bad.tf`));
await check("skip a file that does not parse", () =>
  assert.equal(read(`${tmp}/bad.tf`), "a   = {\n"),
);

// A file in a temp folder is a scratch file, not project code.
const scratch = `${process.env.TMPDIR || "/tmp"}/format-code-scratch.tf`;
unformatted(scratch);
edit(scratch);
await untouched("a file in a temp folder", scratch);
fs.rmSync(scratch);

// --- A Bash call ---

const repo = `${tmp}/repo`;
fs.mkdirSync(`${repo}/infra`, { recursive: true });
git(repo, "init", "-q");
unformatted(`${repo}/infra/heredoc.tf`);
bash(repo, "cat > infra/heredoc.tf <<'EOF'\na = 1\nEOF");
await formatted(
  "a relative path, against the payload cwd",
  `${repo}/infra/heredoc.tf`,
);

unformatted(`${repo}/one.tf`);
unformatted(`${repo}/two.tfvars`);
bash(
  repo,
  `sed -i '' s/x/y/ ${repo}/one.tf && sed -i '' s/x/y/ ${repo}/two.tfvars`,
);
await formatted("the first of two files in one command", `${repo}/one.tf`);
await formatted("the second of two files in one command", `${repo}/two.tfvars`);

unformatted(`${repo}/notes.md`);
bash(repo, `printf x > ${repo}/notes.md`);
await untouched("a command that names no Terraform path", `${repo}/notes.md`);

await quiet(
  "a named path that does not exist",
  bash(repo, `rm ${repo}/gone.tf`),
);

// Write and commit in one call: the commit holds the unformatted file, so
// the hook names the file in the amend hint.
unformatted(`${repo}/committed.tf`);
git(repo, "add", "-A");
git(repo, "commit", "-qm", "seed");
const ran = bash(repo, `touch ${repo}/committed.tf\ngit commit -am infra`);
await formatted("a file the command committed", `${repo}/committed.tf`);
await check("hint: names the file", () => {
  const out = JSON.parse(ran.stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /committed\.tf/);
});

// `git -C <dir> commit` also commits, so the hint comes.
unformatted(`${repo}/dash-c.tf`);
git(repo, "add", "-A");
git(repo, "commit", "-qm", "dash-c");
const dashC = bash(
  repo,
  `touch ${repo}/dash-c.tf && git -C ${repo} commit -am infra`,
);
await check("hint: also after git -C <dir> commit", () =>
  assert.match(dashC.stdout, /dash-c\.tf/),
);

// A path the command only read stays as it is: its old mtime says so.
unformatted(`${repo}/read-only.tf`);
fs.utimesSync(`${repo}/read-only.tf`, 0, 0);
bash(repo, `cat ${repo}/read-only.tf > ${repo}/copy.tf`);
await untouched("a path the command only read", `${repo}/read-only.tf`);

// Another session's edit leaves the tree dirty while terraform fmt changed
// nothing, so there is nothing to amend.
fs.writeFileSync(`${repo}/settled.tf`, FORMATTED);
git(repo, "add", "settled.tf");
git(repo, "commit", "-qm", "settled");
fs.appendFileSync(`${repo}/settled.tf`, "# another session\n");
await quiet(
  "hint: none for a file terraform fmt left as it was",
  bash(repo, `git add ${repo}/settled.tf && git commit -m settled`),
);

unformatted(`${repo}/quiet.tf`);
await quiet(
  "hint: none without a commit",
  bash(repo, `touch ${repo}/quiet.tf`),
);
await formatted("a file written with no commit", `${repo}/quiet.tf`);

// --- shfmt ---

/** Shell that shfmt changes: a 4-space indent and a double space. */
const RAW_SH = "if true; then\n    echo  a\nfi\n";
const CASE = "case $1 in\na) echo a ;;\nesac\n";
const shfmtFile = (what: string, file: string, want: string) =>
  check(`shfmt: ${what}`, () => assert.equal(read(file), want));

// No .editorconfig above the fixture: the hook passes -i 2 -ci. An
// .editorconfig above $HOME would make shfmt use it instead.
const above = (dir: string): boolean =>
  fs.existsSync(`${dir}/.editorconfig`) ||
  (dir !== "/" && above(path.dirname(dir)));
if (above(tmp)) console.log("SKIP shfmt -i 2: an .editorconfig is above $HOME");
else {
  fs.writeFileSync(`${tmp}/edit.sh`, RAW_SH);
  await quiet("shfmt: edit prints nothing", edit(`${tmp}/edit.sh`));
  await shfmtFile(
    "a 2-space indent with no .editorconfig",
    `${tmp}/edit.sh`,
    "if true; then\n  echo a\nfi\n",
  );
  fs.writeFileSync(`${tmp}/case.sh`, CASE);
  edit(`${tmp}/case.sh`);
  await shfmtFile(
    "an indented case branch with no .editorconfig",
    `${tmp}/case.sh`,
    "case $1 in\n  a) echo a ;;\nesac\n",
  );
}

// An .editorconfig in the repo: shfmt takes its indent, here 4 spaces.
fs.writeFileSync(
  `${repo}/.editorconfig`,
  "root = true\n[*.sh]\nindent_style = space\nindent_size = 4\n",
);
fs.writeFileSync(`${repo}/ec.bash`, "echo  a\n");
fs.writeFileSync(`${repo}/ec.sh`, "if true; then\n  echo a\nfi\n");
edit(`${repo}/ec.sh`);
await shfmtFile(
  "the indent of the .editorconfig",
  `${repo}/ec.sh`,
  RAW_SH.replace("echo  a", "echo a"),
);
bash(repo, "touch ec.bash");
await shfmtFile(
  "a .bash path that a command names",
  `${repo}/ec.bash`,
  "echo a\n",
);

fs.writeFileSync(`${repo}/bad.sh`, "if true; then\n");
await quiet("shfmt: a file that does not parse", edit(`${repo}/bad.sh`));
await shfmtFile(
  "skip a file that does not parse",
  `${repo}/bad.sh`,
  "if true; then\n",
);

fs.writeFileSync(`${repo}/committed.sh`, RAW_SH);
git(repo, "add", "-A");
git(repo, "commit", "-qm", "shell");
const shCommit = bash(repo, "touch committed.sh && git commit -am shell");
await check("shfmt: the hint names the file and shfmt", () =>
  assert.match(shCommit.stdout, /shfmt reformatted.*committed\.sh/),
);
fs.rmSync(`${repo}/.editorconfig`);

// --- AGENT_HOOKS_DISABLE ---

const noIo = new Proxy({}, { get: () => () => assert.fail("the hook ran") });
await check("AGENT_HOOKS_DISABLE that names the hook: nothing runs", async () =>
  assert.equal(
    await format({ filePath: "/x/a.tf", cwd: "/x" }, noIo as never, {
      hooksOff: "lint-code format-code",
    }),
    undefined,
  ),
);

// --- pi.ts and hooks/register.ts, with stubs over the real files ---

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
let piHandler: Handler | undefined;
extension({
  on: (_name: string, handler: Handler) => (piHandler = handler),
} as never);
unformatted(`${repo}/pi.tf`);
await check("pi.ts: formats the file of an edit", async () => {
  const result = await piHandler?.(
    { toolName: "edit", input: { path: "pi.tf" }, content: [] },
    { cwd: repo },
  );
  assert.equal(result, undefined);
  assert.equal(read(`${repo}/pi.tf`), FORMATTED);
});
unformatted(`${repo}/pi-commit.tf`);
git(repo, "add", "-A");
git(repo, "commit", "-qm", "pi");
await check("pi.ts: appends the amend hint to the result", async () => {
  const content = [{ type: "text", text: "committed" }];
  const result = (await piHandler?.(
    {
      toolName: "bash",
      input: { command: `touch pi-commit.tf && git commit -am pi` },
      content,
    },
    { cwd: repo },
  )) as { content: { text: string }[] };
  assert.equal(result.content[0]?.text, "committed");
  assert.match(result.content[1]?.text ?? "", /pi-commit\.tf/);
});

let ompHandler: Handler | undefined;
ompExtension({
  on: (_name: string, handler: Handler) => (ompHandler = handler),
} as never);
const omp = (toolName: string, input: object, details?: object) =>
  ompHandler?.({ toolName, input, details, content: [] }, { cwd: repo });
await check("omp.ts: formats each file of a multi-file edit", async () => {
  unformatted(`${repo}/omp-a.tf`);
  unformatted(`${repo}/omp-b.tf`);
  await omp("edit", { paths: ["omp-a.tf", "omp-b.tf"] });
  assert.equal(read(`${repo}/omp-a.tf`), FORMATTED);
  assert.equal(read(`${repo}/omp-b.tf`), FORMATTED);
});
await check("omp.ts: formats the files of an applied ast_edit", async () => {
  unformatted(`${repo}/omp-ast.tf`);
  await omp(
    "write",
    { path: "xd://resolve" },
    {
      xdev: {
        tool: "resolve",
        inner: {
          action: "apply",
          sourceToolName: "ast_edit",
          sourceResultDetails: { applied: true, files: ["omp-ast.tf"] },
        },
      },
    },
  );
  assert.equal(read(`${repo}/omp-ast.tf`), FORMATTED);
});
await check("omp.ts: leaves the calls of pi.ts alone", async () => {
  unformatted(`${repo}/omp-pi.tf`);
  await omp("write", { path: "omp-pi.tf" });
  assert.equal(read(`${repo}/omp-pi.tf`), RAW);
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
  },
  process: {
    run: async (argv: string[], init: { cwd: string }) => {
      const done = spawnSync(argv[0]!, argv.slice(1), {
        cwd: init.cwd,
        env,
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
unformatted(`${repo}/mod.tf`);
await check("register.ts: formats the file and passes the result", async () => {
  assert.equal(
    await modHook?.(
      stub$,
      { tool: "Write", file_path: `${repo}/mod.tf` },
      async () => result,
    ),
    result,
  );
  assert.equal(read(`${repo}/mod.tf`), FORMATTED);
});
unformatted(`${repo}/mod-commit.tf`);
git(repo, "add", "-A");
git(repo, "commit", "-qm", "mod");
await check("register.ts: adds the amend hint as context", async () => {
  const done = (await modHook?.(
    stub$,
    { tool: "Bash", command: `touch mod-commit.tf && git commit -am mod` },
    async () => result,
  )) as { text: string; context: string[] };
  assert.equal(done.text, "written");
  assert.match(done.context[0] ?? "", /mod-commit\.tf/);
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
