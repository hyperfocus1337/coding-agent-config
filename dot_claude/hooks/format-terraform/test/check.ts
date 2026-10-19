/**
 * Self-check for ../core.ts and its adapters: the cases through command.ts
 * with the real git and terraform, then the pi and mod adapters with stubs
 * over the real files.
 *
 * Run: node test/check.ts, from the hook directory. Fixtures live under $HOME,
 * because the hook skips /tmp and $TMPDIR. Without git or terraform the hook
 * does nothing, so the check skips with a message instead of passing.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { format } from "../core.ts";
import { register } from "../hooks/register.ts";
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

for (const program of ["git", "terraform"])
  if (spawnSync(program, ["--version"]).error) {
    console.log(`SKIP no ${program} on PATH`);
    process.exit(0);
  }

const tmp = fs.mkdtempSync(path.join(os.homedir(), ".tf-hook-test."));
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
const scratch = `${process.env.TMPDIR || "/tmp"}/tf-hook-scratch.tf`;
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
let ran = bash(repo, `touch ${repo}/committed.tf\ngit commit -am infra`);
await formatted("a file the command committed", `${repo}/committed.tf`);
await check("hint: names the file", () => {
  const out = JSON.parse(ran.stdout) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /committed\.tf/);
});

// A path the command only read stays as it is: its old mtime says so.
unformatted(`${repo}/read-only.tf`);
fs.utimesSync(
  `${repo}/read-only.tf`,
  new Date(2020, 0, 1),
  new Date(2020, 0, 1),
);
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
ran = bash(repo, `touch ${repo}/quiet.tf`);
await quiet("hint: none without a commit", ran);
await formatted("a file written with no commit", `${repo}/quiet.tf`);

// --- CLAUDE_HOOKS_DISABLE ---

await check(
  "CLAUDE_HOOKS_DISABLE that names the hook: nothing runs",
  async () =>
    assert.equal(
      await format(
        { filePath: "/x/a.tf", cwd: "/x" },
        new Proxy(
          {},
          { get: () => () => assert.fail("the hook ran") },
        ) as never,
        {
          hooksOff: "lint-code format-terraform",
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
