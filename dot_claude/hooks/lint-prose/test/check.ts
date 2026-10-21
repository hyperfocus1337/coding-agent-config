/**
 * Self-check for ../core.ts and its adapters: the test.sh cases through
 * command.ts with the real Vale, and the pi and mod adapters with stubs over
 * the real files.
 *
 * Run: node test/check.ts, from the hook directory. Needs vale and git.
 * Fixtures live under $HOME, because the hook skips /tmp and $TMPDIR.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { check as lintProse } from "../core.ts";
import { register } from "../hooks/register.ts";
import ompExtension from "../omp.ts";
import extension from "../pi.ts";

const hook = path.dirname(path.dirname(new URL(import.meta.url).pathname));
// A hook that /toggle-hook turned off in the agent that runs this check
// still runs here.
delete process.env.AGENT_HOOKS_DISABLE;
// The Vale config in the chezmoi source, not the applied copy in ~/.config.
const valeDir = path.resolve(hook, "../../../dot_config/vale");

let failures = 0;
async function check(what: string, run: () => void | Promise<void>) {
  try {
    await run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${what}\n  ${(error as Error).message}`);
  }
}

// Without vale the hook turns itself off and every case would pass.
if (spawnSync("vale", ["--version"]).status !== 0) {
  console.log("SKIP no vale on PATH");
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.homedir(), ".lint-prose-test."));
const write = (file: string, text: string) => {
  fs.writeFileSync(file, text);
  return file;
};
const base: Record<string, string | undefined> = {
  ...process.env,
  LINT_PROSE_VALE_DIR: valeDir,
  CLAUDE_LINT_DISABLE: undefined,
};

/** Runs command.ts on a payload; returns the exit code and stderr. */
function run(payload: object, env: Record<string, string | undefined> = {}) {
  const ran = spawnSync(process.execPath, [`${hook}/command.ts`], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...base, ...env },
  });
  return { status: ran.status, out: ran.stdout + ran.stderr };
}
const edit = (file: string, extra: object = {}) => ({
  hook_event_name: "PostToolUse",
  tool_input: { file_path: file },
  ...extra,
});
async function expect(
  what: string,
  ran: ReturnType<typeof run>,
  status: number,
  holds = "",
) {
  await check(what, () => {
    assert.equal(ran.status, status, ran.out);
    assert.ok(ran.out.includes(holds), `output does not hold '${holds}'`);
    if (!holds) assert.equal(ran.out, "");
  });
}

const long = "One. Two. Three. Four. Five. Six, the last sentence here.";

// --- AGENT_HOOKS_DISABLE ---

await check("AGENT_HOOKS_DISABLE that names the hook: nothing runs", async () =>
  assert.deepEqual(
    await lintProse(
      "/x/a.md",
      "s",
      new Proxy({}, { get: () => () => assert.fail("the hook ran") }) as never,
      {
        valeDir: "/x",
        hooksOff: "lint-code lint-prose",
      },
    ),
    {},
  ),
);

// --- Markdown ---
const longMd = write(
  `${tmp}/long.md`,
  `# Title\n\n${long}\n\nOne. Two. Three. Four. Five.\n`,
);
let ran = run(edit(longMd));
await expect("Write blocks a paragraph over 5 sentences", ran, 2, "long.md:3:");
await check("5 sentences are allowed", () =>
  assert.ok(!ran.out.includes("long.md:5:")),
);

ran = run(edit(write(`${tmp}/item.md`, `- ${long}\n- Short item.\n`)));
await expect("a list item over 5 sentences is blocked", ran, 2, "item.md:1:");

ran = run(
  edit(
    write(
      `${tmp}/skip.md`,
      `---\nargument-hint: [a | b]\ndescription: ${long}\n---\n\n\`\`\`\n${long}\n\`\`\`\n\nUse \`a.b. c.d. e.f. g.h.\` here, e.g. this. Or i.e. that. Three. Four. Five.\n`,
    ),
  ),
);
await expect(
  "invalid frontmatter, code, and abbreviations are not counted",
  ran,
  0,
);

// --- Org ---
ran = run(
  edit(
    write(
      `${tmp}/long.org`,
      `#+title: A [b] {c}\n\n* A. B. C. D. E. F. G.\n\n${long}\n\n#+begin_src sh\n${long}\n#+end_src\n`,
    ),
  ),
);
await expect("Org: a long paragraph is blocked", ran, 2, "long.org:5:");
await check("Org: keywords, headings, and src blocks are not counted", () =>
  assert.equal(ran.out.match(/ParagraphLength/g)?.length, 1),
);

// --- HTML ---
ran = run(
  edit(
    write(
      `${tmp}/ok.html`,
      `<html><head><script>a. b. c. d. e. f. g.</script></head>\n<body><pre>${long}</pre>\n<p>Short.</p></body></html>\n`,
    ),
  ),
);
await expect("HTML: script and pre are not counted", ran, 0);

// --- Plain text ---
ran = run(edit(write(`${tmp}/notes.txt`, `${long}\n\nShort.\n`)));
await expect("plain text: a long paragraph is blocked", ran, 2, "notes.txt:1:");

// --- Bash ---
// Not wired to Bash, but a Bash payload that reaches the hook must not block.
ran = run({
  hook_event_name: "PostToolUse",
  tool_input: { command: `cat ${longMd}` },
});
await expect("a Bash payload is left alone", ran, 0);

// --- Only the changed paragraphs (a git repo) ---
const repo = `${tmp}/repo`;
fs.mkdirSync(repo);
const git = (...args: string[]) =>
  spawnSync("git", args, {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
      // Turn off the format-staged-files pre-commit hook from
      // ~/.config/git/config, so each commit holds the fixture text.
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "hook.claude-format-staged.enabled",
      GIT_CONFIG_VALUE_0: "false",
    },
  });
git("init", "-q");
// An old long paragraph over two lines, then a short one.
const old = write(
  `${repo}/old.md`,
  `${long}\nStill the old paragraph.\n\nShort.\n`,
);
git("add", "old.md");
ran = run(edit(old));
await expect(
  "before the first commit a file is checked whole",
  ran,
  2,
  "old.md:1:",
);
git("commit", "-q", "-m", "old");

write(old, `${long}\nStill the old paragraph.\n\nShort, and changed.\n`);
ran = run(edit(old));
await expect(
  "an old long paragraph that did not change is not reported",
  ran,
  0,
);

write(
  old,
  `${long}\nThe old paragraph, changed on its second line.\n\nShort.\n`,
);
ran = run(edit(old));
await expect(
  "a change on a later line of a long paragraph reports it",
  ran,
  2,
  "old.md:1:",
);

git("checkout", "-q", "--", "old.md");
const five = write(`${repo}/five.md`, "One. Two. Three. Four. Five.\n");
git("add", "five.md");
git("commit", "-q", "-m", "five");
write(five, "One. Two. Three. Four. Five. Six.\n");
ran = run(
  edit(five, {
    tool_input: {
      file_path: five,
      old_string: "Five.",
      new_string: "Five. Six.",
    },
  }),
);
await expect(
  "an Edit that adds a 6th sentence to a paragraph is blocked",
  ran,
  2,
  "five.md:1:",
);

ran = run(edit(write(`${repo}/new.md`, `${long}\n`)));
await expect("an untracked file is checked whole", ran, 2, "new.md:1:");

// A deletion marks the line before it, so a paragraph that lost a line counts.
write(old, `${long}\n\nShort.\n`);
ran = run(edit(old));
await expect(
  "a deleted line marks its paragraph as changed",
  ran,
  2,
  "old.md:1:",
);
git("checkout", "-q", "--", "old.md");

// --- Once per session ---
// The record goes in $TMPDIR. A directory of its own keeps the fixtures in
// $tmp outside $TMPDIR, which the hook skips.
const state = `${tmp}/state`;
fs.mkdirSync(state);
const repeat = `${tmp}/repeat.md`;
const session = (id: string) =>
  run(edit(repeat, { session_id: id }), { TMPDIR: state });
write(repeat, `${long}\n`);
await expect(
  "a session blocks on an alert the first time",
  session("a"),
  2,
  "repeat.md:1:",
);
await expect(
  "a repeat goes to the user, not blocked",
  session("a"),
  1,
  "blocked on before",
);
write(repeat, `\n${long}\n`);
await expect(
  "a paragraph that only moved is still a repeat",
  session("a"),
  1,
  "repeat.md:2:",
);
write(repeat, `\n${long} Seven.\n`);
await expect(
  "a changed paragraph that is still too long blocks again",
  session("a"),
  2,
  "repeat.md:2:",
);
await expect(
  "another session blocks on the same alert",
  session("b"),
  2,
  "repeat.md:2:",
);
await expect(
  "a session id with other characters keeps no record",
  run(edit(repeat, { session_id: "../x" }), { TMPDIR: state }),
  2,
  "repeat.md:2:",
);
await check("the record is in $TMPDIR, one file for each session", () =>
  assert.deepEqual(fs.readdirSync(state).sort(), [
    "lint-prose-a",
    "lint-prose-b",
  ]),
);

// --- A Vale failure does not block ---
// A copy of the Vale config with a rule Vale cannot load.
fs.cpSync(valeDir, `${tmp}/broken`, { recursive: true });
write(
  `${tmp}/broken/styles/Writing/ParagraphLength.yml`,
  "extends: nonsense\n",
);
await expect(
  "a broken rule is reported to the user, not blocked",
  run(edit(longMd), { LINT_PROSE_VALE_DIR: `${tmp}/broken` }),
  1,
  "Vale failed",
);
await expect(
  "a missing Vale config is reported to the user, not blocked",
  run(edit(longMd), { LINT_PROSE_VALE_DIR: `${tmp}/missing` }),
  1,
  "just chezmoi",
);

// --- Skips ---
await expect(
  "a file that is not prose is skipped",
  run(edit(write(`${tmp}/notes.log`, `${long}\n`))),
  0,
);
await expect(
  "CLAUDE_LINT_DISABLE=prose turns the hook off",
  run(edit(longMd), { CLAUDE_LINT_DISABLE: "prose" }),
  0,
);
await expect(
  "CLAUDE_LINT_DISABLE=all turns the hook off",
  run(edit(longMd), { CLAUDE_LINT_DISABLE: "yaml,all" }),
  0,
);
// A mise shim with no version set: on PATH, but it fails when run.
fs.mkdirSync(`${tmp}/bin`);
write(
  `${tmp}/bin/vale`,
  '#!/bin/sh\necho "mise ERROR No version is set for shim: vale" >&2\nexit 1\n',
);
fs.chmodSync(`${tmp}/bin/vale`, 0o755);
await expect(
  "a vale shim that cannot run is skipped",
  run(edit(longMd), { PATH: `${tmp}/bin:${process.env.PATH}` }),
  0,
);
const throwaway = write("/tmp/lint-prose-test-throwaway.md", `${long}\n`);
await expect("a throwaway file under /tmp is skipped", run(edit(throwaway)), 0);
fs.rmSync(throwaway);
await expect(
  "a file that does not exist is skipped",
  run(edit(`${tmp}/gone.md`)),
  0,
);

// --- pi.ts and hooks/register.ts, with stubs over the real files ---

process.env.LINT_PROSE_VALE_DIR = valeDir;
delete process.env.CLAUDE_LINT_DISABLE;
process.env.TMPDIR = state;
const adapter = write(`${tmp}/adapter.md`, `${long}\n`);
const clean = write(`${tmp}/clean.md`, "Short.\n");

const notices: string[] = [];
const ctx = {
  cwd: tmp,
  sessionManager: { getSessionId: () => "pi" },
  ui: { notify: (text: string) => notices.push(text) },
};
/** Loads an extension; returns a function that calls its tool_result handler. */
function caller(load: typeof extension) {
  let handler: (event: unknown, ctx: unknown) => Promise<unknown>;
  load({ on: (_name: string, on: typeof handler) => (handler = on) } as never);
  return (toolName: string, input: object, isError = false) =>
    handler(
      {
        toolName,
        input,
        content: [{ type: "text", text: "written" }],
        isError,
      },
      ctx,
    ) as Promise<{ content: { text: string }[]; isError: boolean } | undefined>;
}
const piCall = caller(extension);
await check("pi.ts: appends the alerts and marks an error", async () => {
  const result = await piCall("write", { path: "adapter.md" });
  assert.equal(result?.isError, true);
  assert.equal(result?.content[0]?.text, "written");
  assert.match(
    result?.content[1]?.text ?? "",
    /adapter\.md:1:.*ParagraphLength/,
  );
});
await check("pi.ts: a repeat goes to a notification", async () => {
  assert.equal(await piCall("edit", { path: adapter }), undefined);
  assert.match(notices[0] ?? "", /blocked on before/);
});
await check(
  "pi.ts: leaves a clean file, a failed call, and other tools alone",
  async () => {
    assert.equal(await piCall("write", { path: clean }), undefined);
    write(`${tmp}/failed.md`, `${long}\n`);
    assert.equal(await piCall("edit", { path: "failed.md" }, true), undefined);
    assert.equal(await piCall("read", { path: "failed.md" }), undefined);
  },
);

const ompCall = caller(ompExtension);
await check("omp.ts: lints each file of a multi-file edit", async () => {
  write(`${tmp}/omp.md`, `${long}\n`);
  const result = await ompCall("edit", { paths: ["clean.md", "omp.md"] });
  assert.equal(result?.isError, true);
  assert.match(result?.content[1]?.text ?? "", /omp\.md:1:.*ParagraphLength/);
});
await check(
  "omp.ts: leaves the one file of an edit to pi.ts, and a failed call",
  async () => {
    write(`${tmp}/omp-one.md`, `${long}\n`);
    assert.equal(
      await ompCall("edit", { path: "omp-one.md", paths: ["omp-one.md"] }),
      undefined,
    );
    assert.equal(
      await ompCall("edit", { paths: ["omp-one.md", "clean.md"] }, true),
      undefined,
    );
    assert.equal(await ompCall("write", { path: "omp-one.md" }), undefined);
  },
);

type Hook = (...args: unknown[]) => Promise<unknown>;
let modHook: Hook | undefined;
register(
  ((_event: string, _matcher: unknown, hook: Hook) =>
    (modHook = hook)) as never,
  {} as never,
);
const toasts: string[] = [];
const stub$ = {
  session: { id: async () => "mod" },
  env: { get: async (name: string) => process.env[name] },
  fs: {
    stat: async (file: string) => ({
      kind: fs.statSync(file).isFile() ? "file" : "dir",
    }),
    read: async (file: string) => fs.readFileSync(file, "utf8"),
    write: async (file: string, text: string) => fs.writeFileSync(file, text),
  },
  process: {
    run: async (argv: string[], init: { cwd: string }) => {
      const done = spawnSync(argv[0]!, argv.slice(1), {
        cwd: init.cwd,
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
  ui: {
    notify: async (text: string) => {
      toasts.push(text);
      return { isSent: true };
    },
  },
};
const result = { result: "ok", text: "written" };
const modCall = (file: string, next: unknown = result) =>
  modHook?.(
    stub$,
    { tool: "Write", file_path: file },
    async () => next,
  ) as Promise<{ text: string; context?: string[] }>;
await check("register.ts: adds the alerts as context", async () => {
  const done = await modCall(adapter);
  assert.equal(done.text, "written");
  assert.match(
    done.context?.[0] ?? "",
    /^Prose lint errors[\s\S]*adapter\.md:1:/,
  );
});
await check("register.ts: a repeat goes to a notification", async () => {
  assert.equal(await modCall(adapter), result);
  assert.match(toasts[0] ?? "", /blocked on before/);
});
await check(
  "register.ts: passes a clean result, a deny, and an error through",
  async () => {
    assert.equal(await modCall(clean), result);
    const denied = { deny: "no" };
    assert.equal(await modCall(`${tmp}/failed.md`, denied), denied);
    const failed = { isError: true, text: "no match" };
    assert.equal(await modCall(`${tmp}/failed.md`, failed), failed);
  },
);

fs.rmSync(tmp, { recursive: true });
if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
