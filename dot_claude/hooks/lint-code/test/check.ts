/** Run: node test/check.ts. Needs git; linters are stand-ins, not dependencies. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { check as checkLint, lint, type Io } from "../core.ts";
import { nodeIo } from "../io.ts";
import extension from "../pi.ts";
import ompExtension from "../omp.ts";
import tscExtension from "../../type-check-tsc/pi.ts";
import pyreflyExtension from "../../type-check-pyrefly/pi.ts";

const hook = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const codex = spawnSync("sh", [path.resolve(hook, "../../../dot_codex/modify_hooks.json")], {
  input: "{}",
  encoding: "utf8",
});
assert.equal(codex.status, 0, codex.stderr);
const configured = JSON.parse(codex.stdout).hooks;
assert.equal(
  configured.Stop.flatMap((group: { hooks: { command: string }[] }) => group.hooks).filter(
    (entry: { command: string }) => entry.command.includes("lint-code/command.ts"),
  ).length,
  1,
);
assert.ok(!JSON.stringify(configured.PostToolUse).includes("lint-code"));
delete process.env.AGENT_HOOKS_DISABLE;
const settings = { configDir: "/cfg" };
function stub(files: string[] = [], texts: Record<string, string> = {}) {
  const ran: string[][] = [];
  const dirs: (string | undefined)[] = [];
  const io: Io = {
    stat: async (file) => (files.includes(file) ? { isFile: true } : undefined),
    read: async (file) => texts[file] ?? "",
    run: async (argv, options) => {
      ran.push(argv);
      dirs.push(options?.cwd);
      return { exitCode: 1, output: `${argv[0]} says no\n` };
    },
  };
  return { io, ran, dirs };
}

const files = [
  "a.py",
  "b.tsx",
  "c.cjs",
  "c.mts",
  "c.cts",
  "d.bash",
  "e.yml",
  "/r/roles/f.yaml",
  "/m/main.tf",
  "g.tfvars",
  "h.md",
];
const routed = stub();
await lint(files, routed.io, settings);
assert.deepEqual(routed.ran, [
  ["ruff", "check", "--quiet", "a.py"],
  ["oxlint", "--deny-warnings", "b.tsx"],
  ["oxlint", "--deny-warnings", "c.cjs"],
  ["oxlint", "--deny-warnings", "c.mts"],
  ["oxlint", "--deny-warnings", "c.cts"],
  ["shellcheck", "-S", "warning", "d.bash"],
  ["yamllint", "-c", "/cfg/.yamllint", "e.yml"],
  ["ansible-lint", "-c", "/cfg/.ansible-lint", "-q", "/r/roles/f.yaml"],
  ["tflint", "--config=/cfg/.tflint.hcl", "--filter=main.tf", "--format=compact", "--no-color"],
]);
assert.equal(routed.dirs.at(-1), "/m");
for (const own of ["/m/.tflint.hcl", "/m/.tflint.json"]) {
  const { io, ran } = stub([own]);
  await lint(["/m/main.tf"], io, settings);
  assert.equal(ran[0]?.[1], "--filter=main.tf");
}
for (const output of [
  'Plugin missing. Did you run "tflint --init"?\n',
  "mise ERROR No version is set for shim: tflint\n",
]) {
  assert.equal(
    await lint(
      ["/m/main.tf"],
      {
        ...stub().io,
        run: async () => ({ exitCode: 1, output }),
      },
      settings,
    ),
    undefined,
  );
}
const ansible = stub([], { "x/deploy.yml": "- hosts: all\n" });
await lint(["x/site.yaml", "x/deploy.yml", "x/other.yml"], ansible.io, settings);
assert.deepEqual(
  ansible.ran.map((argv) => argv[0]),
  ["ansible-lint", "ansible-lint", "yamllint"],
);
const disabled = stub();
await lint(["a.py", "b.ts", "c.sh", "/m/d.tf"], disabled.io, { ...settings, disable: "py,sh tf" });
assert.deepEqual(
  disabled.ran.map((argv) => argv[0]),
  ["oxlint"],
);
assert.equal(await lint(["a.py"], disabled.io, { ...settings, disable: "all" }), undefined);
const missing: Io = {
  ...stub().io,
  run: async (argv) =>
    argv[0] === "ruff"
      ? undefined
      : {
          exitCode: argv[0] === "oxlint" ? 0 : 1,
          output: `${argv[0]}\n`,
        },
};
assert.equal(await lint(["a.py"], missing, settings), undefined);
assert.equal(await lint(["b.ts"], missing, settings), undefined);
assert.equal(await lint(["b.ts", "c.sh"], missing, settings), "oxlint\nshellcheck\n");
assert.equal(
  await checkLint(
    "/r",
    new Proxy(
      {},
      {
        get: () => () => assert.fail("disabled hook ran"),
      },
    ) as Io,
    { ...settings, hooksOff: "lint-prose,lint-code" },
  ),
  undefined,
);

// Paths come from NUL-separated git output, not shell text or file age.
for (const root of ["/tmp/repo", "/private/tmp/repo", "/var/tmp/repo", "/custom/tmp/repo"]) {
  const calls: string[][] = [];
  const io: Io = {
    ...stub([`${root}/a.py`]).io,
    run: async (argv) => {
      calls.push(argv);
      if (argv[1] === "rev-parse") return { exitCode: 0, output: `${root}\n` };
      if (argv[1] === "config") return { exitCode: 1, output: "" };
      return { exitCode: 0, output: "a.py\0" };
    },
  };
  assert.equal(await checkLint(root, io, { ...settings, tmpdir: "/custom/tmp" }), undefined);
  assert.ok(calls.every((argv) => argv[0] === "git"));
}

// Integration fixtures live under HOME because scratch repositories are skipped.
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), ".lint-hook-check-")));
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const git = (...args: string[]) => {
  const ran = spawnSync("git", ["-C", `${tmp}/repo`, ...args], { encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
};
const repo = `${tmp}/repo`;
const bin = `${tmp}/bin`;
const log = `${tmp}/log`;
write(`${repo}/old.py`, "x = 1\n");
write(`${repo}/delete.py`, "x = 1\n");
write(`${repo}/.gitignore`, "ignored.py\n");
write(`${repo}/tsconfig.json`, "{}\n");
git("init", "-q");
git("add", ".");
git(
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "user.name=t",
  "-c",
  "user.email=t@example.com",
  "commit",
  "-qm",
  "base",
);
for (const name of ["ruff", "shellcheck", "tsc", "pyrefly"]) {
  write(
    `${bin}/${name}`,
    `#!/bin/sh\necho '${name}' >>"$FAKE_LOG"\nprintf '%s\\n' "${name} error in $PWD: $*"\nexit 1\n`,
  );
  fs.chmodSync(`${bin}/${name}`, 0o755);
}
const env = {
  ...process.env,
  PATH: `${bin}:${process.env.PATH}`,
  FAKE_LOG: log,
  CLAUDE_LINT_DISABLE: "",
};
const command = (extra: object = {}, vars: Record<string, string> = {}) =>
  spawnSync(process.execPath, [`${hook}/command.ts`], {
    input: JSON.stringify({ cwd: repo, stop_hook_active: false, ...extra }),
    encoding: "utf8",
    env: { ...env, ...vars },
  });
const starts = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []);
const clear = () => fs.rmSync(log, { force: true });
try {
  const unicode = await nodeIo(tmp).run([
    process.execPath,
    "-e",
    "process.stdout.write(Buffer.from([0xc3]));setTimeout(() => process.stdout.write(Buffer.from([0xa9])), 50);",
  ]);
  assert.equal(unicode?.output, "é");
  assert.equal(await nodeIo(tmp).run([`${tmp}/missing-linter`]), undefined);
  assert.equal(command().status, 0); // No changes.
  assert.deepEqual(starts(), []);
  write(`${repo}/old.py`, "x = 2\n");
  git("add", "old.py"); // Includes staged and unstaged changes, once each.
  write(`${repo}/old.py`, "x = 3\n");
  write(`${repo}/space é.py`, "x = 2\n");
  write(`${repo}/new\nline.py`, "x = 2\n");
  write(`${repo}/ignored.py`, "x = 2\n");
  write(`${repo}/README.md`, "not code\n");
  fs.rmSync(`${repo}/delete.py`);
  fs.utimesSync(`${repo}/old.py`, new Date(2020, 0, 1), new Date(2020, 0, 1));
  const failed = command();
  assert.equal(failed.status, 2, failed.stderr);
  assert.ok(failed.stderr.includes("Lint errors:"));
  assert.ok(failed.stderr.includes("space é.py"));
  assert.ok(failed.stderr.includes("new\nline.py"));
  assert.ok(!failed.stderr.includes("ignored.py"));
  assert.ok(!failed.stderr.includes("delete.py"));
  assert.deepEqual(starts(), ["ruff", "ruff", "ruff"]);
  fs.mkdirSync(`${repo}/nested`);
  assert.ok(command({ cwd: `${repo}/nested` }).stderr.includes(`error in ${repo}:`));
  for (const [extra, vars] of [
    [{ stop_hook_active: true }, {}],
    [{}, { AGENT_HOOKS_DISABLE: "lint-code" }],
    [{}, { CLAUDE_LINT_DISABLE: "all" }],
  ] as const) {
    clear();
    assert.equal(command(extra, vars).status, 0);
    assert.deepEqual(starts(), []);
  }
  git("config", "agent-hook.lint-code.enabled", "false");
  assert.equal(command().status, 0);
  git("config", "--unset", "agent-hook.lint-code.enabled");
  assert.equal(command({ cwd: tmp }).status, 0); // Outside git.
  const first = `${tmp}/first`;
  write(`${first}/first.py`, "x = 1\n");
  assert.equal(spawnSync("git", ["-C", first, "init", "-q"]).status, 0);
  assert.equal(command({ cwd: first }).status, 2); // Before the first commit.

  Object.assign(process.env, env);
  type Handler = (event: unknown, ctx: unknown) => unknown | Promise<unknown>;
  const handlers = new Map<string, Handler[]>();
  const api = {
    on: (name: string, handler: Handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
  };
  extension(api as never);
  tscExtension(api as never);
  pyreflyExtension(api as never);
  assert.deepEqual([...handlers.keys()].sort(), ["agent_before_settle", "agent_settled"]);
  const settle = async (outcome = "completed") => {
    let state = {
      entries: [] as { customType: string; content: string }[],
      continue: false,
      outcome,
    };
    for (const handler of handlers.get("agent_before_settle") ?? []) {
      const result = (await handler(state, { cwd: repo })) as Partial<typeof state> | undefined;
      if (result) state = { ...state, ...result };
    }
    return state;
  };
  const settled = async () => {
    for (const handler of handlers.get("agent_settled") ?? []) await handler({}, { cwd: repo });
  };
  clear();
  const initial = await settle();
  assert.equal(initial.continue, true);
  assert.deepEqual(
    initial.entries.map((entry) => entry.customType),
    ["lint-code", "type-check-pyrefly"],
  );
  assert.ok(initial.entries.every((entry) => entry.content.includes("error")));
  // A check that passed initially must not start a second correction run.
  write(`${repo}/new.ts`, "let x = 1;\n");
  assert.deepEqual((await settle()).entries, []);
  assert.equal((await settle()).continue, false);
  assert.ok(!starts().includes("tsc"));
  await settled();
  const next = await settle();
  assert.deepEqual(
    next.entries.map((entry) => entry.customType),
    ["lint-code", "type-check-tsc", "type-check-pyrefly"],
  );
  await settled();
  clear();
  assert.equal((await settle("aborted")).continue, false);
  assert.equal((await settle("error")).continue, false);
  assert.deepEqual(starts(), []);

  let stop: Handler | undefined;
  ompExtension({
    on: (name, handler) => {
      assert.equal(name, "session_stop");
      stop = handler as Handler;
    },
  });
  const result = (await stop?.({ stop_hook_active: false }, { cwd: repo })) as {
    continue: boolean;
    additionalContext: string;
  };
  assert.equal(result.continue, true);
  assert.ok(result.additionalContext.includes("Lint errors:"));
  assert.equal(await stop?.({ stop_hook_active: true }, { cwd: repo }), undefined);
  for (const stopReason of ["aborted", "error"]) {
    assert.equal(
      await stop?.(
        { stop_hook_active: false, last_assistant_message: { stopReason } },
        { cwd: repo },
      ),
      undefined,
    );
  }
} finally {
  fs.rmSync(tmp, { recursive: true });
}
console.log("all pass");
