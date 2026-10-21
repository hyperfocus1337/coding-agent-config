/**
 * Self-check for ../core.ts and its adapters: the core with stub I/O,
 * command.ts with the real shellcheck, and the pi, omp, and mod adapters with
 * stubs over the real files.
 *
 * Run: node test/check.ts, from the hook directory. Fixtures live under $HOME,
 * because the hook skips /tmp and $TMPDIR.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { lint, targets, type Io } from "../core.ts";
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

// --- Core, with stub I/O ---

const NOW = 1_000_000_000;
/** Stub I/O over a map of path -> age in seconds; run records each argv. */
function stub(
  ages: Record<string, number>,
  texts: Record<string, string> = {},
) {
  const ran: string[][] = [];
  const io: Io = {
    stat: async (file) =>
      file in ages
        ? { isFile: true, mtimeMs: NOW - ages[file]! * 1000 }
        : undefined,
    read: async (file) => texts[file] ?? "",
    run: async (argv) => {
      ran.push(argv);
      return argv[0] === "missing"
        ? undefined
        : { exitCode: 1, output: `${argv[0]} says no\n` };
    },
  };
  return { io, ran };
}
const settings = { configDir: "/cfg", tmpdir: "/var/folders/x/T/" };

await check("write: the named file of any age, if it exists", async () => {
  const { io } = stub({ "/r/a.py": 999 });
  assert.deepEqual(
    await targets({ filePath: "/r/a.py", cwd: "/r" }, io, settings, NOW),
    ["/r/a.py"],
  );
  assert.deepEqual(
    await targets({ filePath: "/r/gone.sh", cwd: "/r" }, io, settings, NOW),
    [],
  );
});
await check(
  "throwaway files are skipped, with and without /private",
  async () => {
    const files = [
      "/tmp/a.sh",
      "/private/tmp/b.sh",
      "/var/tmp/c.sh",
      "/private/var/folders/x/T/d.sh",
    ];
    const { io } = stub(Object.fromEntries(files.map((file) => [file, 0])));
    for (const filePath of files)
      assert.deepEqual(
        await targets({ filePath, cwd: "/r" }, io, settings, NOW),
        [],
        filePath,
      );
  },
);
await check("bash: fresh named files, relative to cwd, once each", async () => {
  const { io } = stub({
    "/r/new.sh": 5,
    "/r/old.sh": 500,
    "/abs/x.ts": 0,
    "/abs/y.mts": 0,
  });
  const command =
    "cat > new.sh && bash new.sh && grep x old.sh && touch /abs/x.ts /abs/y.mts README.md";
  assert.deepEqual(await targets({ command, cwd: "/r" }, io, settings, NOW), [
    "/r/new.sh",
    "/abs/x.ts",
    "/abs/y.mts",
  ]);
});
await check("bash: a command that names no source file", async () => {
  const { io } = stub({});
  assert.deepEqual(
    await targets(
      { command: "git status && ls -la", cwd: "/r" },
      io,
      settings,
      NOW,
    ),
    [],
  );
});

await check("each extension runs its linter", async () => {
  const files = [
    "a.py",
    "b.tsx",
    "c.cjs",
    "c.mts",
    "c.cts",
    "d.bash",
    "e.yml",
    "/r/roles/f.yaml",
    "g.tfvars",
    "h.md",
  ];
  const { io, ran } = stub({});
  await lint(files, io, settings);
  assert.deepEqual(ran, [
    ["ruff", "check", "--quiet", "a.py"],
    ["oxlint", "--deny-warnings", "b.tsx"],
    ["oxlint", "--deny-warnings", "c.cjs"],
    ["oxlint", "--deny-warnings", "c.mts"],
    ["oxlint", "--deny-warnings", "c.cts"],
    ["shellcheck", "-S", "warning", "d.bash"],
    ["yamllint", "-c", "/cfg/.yamllint", "e.yml"],
    ["ansible-lint", "-c", "/cfg/.ansible-lint", "-q", "/r/roles/f.yaml"],
  ]);
});
await check("ansible by entry-point name and by content", async () => {
  const { io, ran } = stub({}, { "x/deploy.yml": "- hosts: all\n" });
  await lint(["x/site.yaml", "x/deploy.yml", "x/other.yml"], io, settings);
  assert.deepEqual(
    ran.map((argv) => argv[0]),
    ["ansible-lint", "ansible-lint", "yamllint"],
  );
});
await check("CLAUDE_LINT_DISABLE keys, comma or space, and all", async () => {
  const { io, ran } = stub({});
  await lint(["a.py", "b.ts", "c.sh"], io, { ...settings, disable: "py,sh" });
  assert.deepEqual(
    ran.map((argv) => argv[0]),
    ["oxlint"],
  );
  assert.equal(
    await lint(["a.py"], io, { ...settings, disable: "all" }),
    undefined,
  );
});
await check(
  "a missing linter skips its file; output joins every run",
  async () => {
    const io: Io = {
      ...stub({}).io,
      run: async (argv) =>
        argv[0] === "ruff"
          ? undefined
          : { exitCode: argv[0] === "oxlint" ? 0 : 1, output: `${argv[0]}\n` },
    };
    assert.equal(await lint(["a.py"], io, settings), undefined);
    assert.equal(await lint(["b.ts"], io, settings), undefined);
    assert.equal(
      await lint(["b.ts", "c.sh"], io, settings),
      "oxlint\nshellcheck\n",
    );
  },
);

await check("AGENT_HOOKS_DISABLE that names the hook: no targets", async () =>
  assert.deepEqual(
    await targets(
      { filePath: "/x/a.py", cwd: "/x" },
      new Proxy({}, { get: () => () => assert.fail("the hook ran") }) as never,
      { ...settings, hooksOff: "lint-prose,lint-code" },
    ),
    [],
  ),
);

// --- command.ts, with the real shellcheck ---

const tmp = fs.mkdtempSync(path.join(os.homedir(), ".lint-hook-check-"));
const bad = (file: string) =>
  fs.writeFileSync(file, "#!/usr/bin/env bash\nx=$1\necho $unquoted\n");
const clean = (file: string) =>
  fs.writeFileSync(file, "#!/usr/bin/env bash\necho hello\n");
const command = (toolInput: object, env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [path.join(hook, "command.ts")], {
    input: JSON.stringify({ cwd: tmp, tool_input: toolInput }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_LINT_DISABLE: "", ...env },
  });
const expect = (
  what: string,
  ran: ReturnType<typeof command>,
  status: number,
  holds = "",
) =>
  check(what, () => {
    assert.equal(ran.status, status, ran.stderr);
    if (holds) assert.ok(ran.stderr.includes(holds), ran.stderr);
    else assert.equal(ran.stderr, "");
  });

if (spawnSync("shellcheck", ["--version"]).error)
  console.log("SKIP command.ts cases: no shellcheck");
else {
  bad(`${tmp}/bad.sh`);
  clean(`${tmp}/clean.sh`);
  await expect(
    "edit: blocks a file the linter rejects",
    command({ file_path: `${tmp}/bad.sh` }),
    2,
    "SC2154",
  );
  await expect(
    "edit: passes a clean file",
    command({ file_path: `${tmp}/clean.sh` }),
    0,
  );
  await expect(
    "CLAUDE_LINT_DISABLE=all turns the hook off",
    command({ file_path: `${tmp}/bad.sh` }, { CLAUDE_LINT_DISABLE: "all" }),
    0,
  );
  bad(`${tmp}/written.sh`);
  await expect(
    "bash: lints a file the command just wrote",
    command({ command: `cat > ${tmp}/written.sh` }),
    2,
    "SC2154",
  );
  bad(`${tmp}/old.sh`);
  fs.utimesSync(`${tmp}/old.sh`, new Date(2020, 0, 1), new Date(2020, 0, 1));
  await expect(
    "bash: a path the command only read is left alone",
    command({ command: `grep -n TODO ${tmp}/old.sh` }),
    0,
  );
}

// --- pi.ts and hooks/register.ts, with stubs over the real files ---

bad(`${tmp}/adapter.sh`);
type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
let piHandler: Handler | undefined;
extension({
  on: (_name: string, handler: Handler) => (piHandler = handler),
} as never);
await check("pi.ts: appends the lint output and marks an error", async () => {
  const content = [{ type: "text", text: "written" }];
  const result = (await piHandler?.(
    { toolName: "write", input: { path: "adapter.sh" }, content },
    { cwd: tmp },
  )) as { content: { text: string }[]; isError: boolean };
  assert.equal(result.isError, true);
  assert.equal(result.content[0]?.text, "written");
  assert.match(result.content[1]?.text ?? "", /SC2154/);
});
await check("pi.ts: leaves a clean file and other tools alone", async () => {
  assert.equal(
    await piHandler?.(
      { toolName: "write", input: { path: "clean.sh" }, content: [] },
      { cwd: tmp },
    ),
    undefined,
  );
  assert.equal(
    await piHandler?.(
      { toolName: "read", input: { path: "adapter.sh" }, content: [] },
      { cwd: tmp },
    ),
    undefined,
  );
});

let ompHandler: Handler | undefined;
ompExtension({
  on: (_name: string, handler: Handler) => (ompHandler = handler),
} as never);
const omp = (toolName: string, input: object, details?: object) =>
  ompHandler?.(
    { toolName, input, details, content: [] },
    { cwd: tmp },
  ) as Promise<{ isError?: boolean; content: { text: string }[] } | undefined>;
const applied = (applied: boolean) => ({
  xdev: {
    tool: "resolve",
    inner: {
      action: "apply",
      sourceToolName: "ast_edit",
      sourceResultDetails: { applied, files: ["adapter.sh"] },
    },
  },
});
await check("omp.ts: lints each file of a multi-file edit", async () => {
  const result = await omp("edit", { paths: ["clean.sh", "adapter.sh"] });
  assert.equal(result?.isError, true);
  assert.match(result?.content[0]?.text ?? "", /SC2154/);
});
await check("omp.ts: leaves the one file of an edit to pi.ts", async () =>
  assert.equal(
    await omp("edit", { path: "adapter.sh", paths: ["adapter.sh"] }),
    undefined,
  ),
);
await check("omp.ts: lints the files of an applied ast_edit", async () => {
  const result = await omp("write", { path: "xd://resolve" }, applied(true));
  assert.match(result?.content[0]?.text ?? "", /SC2154/);
  assert.equal(
    await omp("write", { path: "xd://resolve" }, applied(false)),
    undefined,
  );
});
await check("omp.ts: lints the files that eval code names", async () => {
  const code = "open('adapter.sh', 'w').write(text)";
  const result = await omp("eval", { language: "py", code });
  assert.match(result?.content[0]?.text ?? "", /SC2154/);
});
await check(
  "omp.ts: leaves the calls of pi.ts and other tools alone",
  async () => {
    assert.equal(await omp("write", { path: "adapter.sh" }), undefined);
    assert.equal(await omp("bash", { command: "cat adapter.sh" }), undefined);
    assert.equal(await omp("read", { path: "adapter.sh" }), undefined);
  },
);

type Hook = (...args: unknown[]) => Promise<unknown>;
let modHook: Hook | undefined;
register(
  ((_event: string, _matcher: unknown, hook: Hook) =>
    (modHook = hook)) as never,
  {} as never,
);
const stub$ = {
  session: { cwd: async () => tmp },
  plugin: { root: hook },
  env: { get: async () => undefined },
  fs: {
    stat: async (file: string) => {
      const found = fs.statSync(file);
      return { kind: found.isFile() ? "file" : "dir", mtimeMs: found.mtimeMs };
    },
    read: async (file: string) => fs.readFileSync(file, "utf8"),
  },
  process: {
    run: async (argv: string[], init: { cwd: string }) => {
      const ran = spawnSync(argv[0]!, argv.slice(1), {
        cwd: init.cwd,
        encoding: "utf8",
      });
      if (ran.error) throw ran.error;
      return {
        exitCode: ran.status ?? 1,
        stdout: ran.stdout,
        stderr: ran.stderr,
      };
    },
  },
};
const ran = { result: "ok", text: "written" };
await check("register.ts: adds the lint output as context", async () => {
  const result = (await modHook?.(
    stub$,
    { tool: "Write", file_path: `${tmp}/adapter.sh` },
    async () => ran,
  )) as {
    text: string;
    context: string[];
  };
  assert.equal(result.text, "written");
  assert.match(result.context[0] ?? "", /Lint errors[\s\S]*SC2154/);
});
await check(
  "register.ts: passes a clean result and a deny through",
  async () => {
    assert.equal(
      await modHook?.(
        stub$,
        { tool: "Write", file_path: `${tmp}/clean.sh` },
        async () => ran,
      ),
      ran,
    );
    const denied = { deny: "no" };
    assert.equal(
      await modHook?.(
        stub$,
        { tool: "Bash", command: "x" },
        async () => denied,
      ),
      denied,
    );
  },
);

fs.rmSync(tmp, { recursive: true });
if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
