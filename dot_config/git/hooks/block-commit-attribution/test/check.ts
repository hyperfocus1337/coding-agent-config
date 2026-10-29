/**
 * Self-check for ../main.ts: real commits in a temporary repository, with the
 * hook command from dot_config/git/config set through GIT_CONFIG_* variables.
 * HOME is a temporary folder that links to this hook folder, so the check
 * runs this source and not the deployed copy.
 *
 * Run: node test/check.ts, from the hook folder. Needs git.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const here = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const repo = path.resolve(here, "../../../..");

let failures = 0;
function check(what: string, run: () => void) {
  try {
    run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${what}\n  ${(error as Error).message}`);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "block-commit-attribution-test-"));
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
const home = `${tmp}/home`;
fs.mkdirSync(`${home}/.config/git/hooks`, { recursive: true });
fs.symlinkSync(here, `${home}/.config/git/hooks/block-commit-attribution`);

// Git parses the value, as it does for ~/.config/git/config: a `;` outside
// quotes starts a comment.
const command = spawnSync(
  "git",
  [
    "config",
    "--file",
    `${repo}/dot_config/git/config`,
    "--get",
    "hook.block-commit-attribution.command",
  ],
  { encoding: "utf8" },
).stdout.trim();
assert.ok(command, "no block-commit-attribution command in dot_config/git/config");

// No agent variable from the session that runs this check.
const base: Record<string, string | undefined> = { ...process.env };
for (const name of ["CLAUDECODE", "PI_CODING_AGENT", "OMPCODE", "CODEX_THREAD_ID"])
  delete base[name];
Object.assign(base, {
  HOME: home,
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "hook.block-commit-attribution.event",
  GIT_CONFIG_VALUE_0: "commit-msg",
  GIT_CONFIG_KEY_1: "hook.block-commit-attribution.command",
  GIT_CONFIG_VALUE_1: command,
});
const work = `${tmp}/work`;
fs.mkdirSync(work);
const claude = { CLAUDECODE: "1" };
const git = (args: string[], env: Record<string, string> = claude, input?: string) =>
  spawnSync("git", args, { cwd: work, encoding: "utf8", env: { ...base, ...env }, input });
const blocks = (args: string[], env?: Record<string, string>, input?: string) => {
  const ran = git(args, env, input);
  assert.notEqual(ran.status, 0, `git ${args.join(" ")} was not blocked`);
  return ran;
};
const allows = (args: string[], env?: Record<string, string>) => {
  const ran = git(args, env);
  assert.equal(ran.status, 0, `git ${args.join(" ")}: ${ran.stderr}`);
};
const empty = ["commit", "-q", "--allow-empty"];

git(["init", "-q"]);
allows([...empty, "-m", "init"]);

const trailer = "fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n";
check("blocks the trailer in -m, with the block message", () =>
  assert.match(blocks([...empty, "-m", trailer]).stderr, /remove the Co-Authored-By trailer/),
);
// The gap of the agent hook: a message in a file that an earlier call wrote.
fs.writeFileSync(`${tmp}/message`, trailer);
check("blocks the trailer in -F <file>", () => blocks([...empty, "-F", `${tmp}/message`]));
check("blocks the trailer in a heredoc on stdin, in lowercase", () =>
  blocks([...empty, "-F", "-"], claude, "fix: x\n\nco-authored-by: claude code\n"),
);
check("blocks a second -m paragraph", () =>
  blocks([
    ...empty,
    "-m",
    "fix: x",
    "-m",
    "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
  ]),
);
// The name is not read, so a human co-author is blocked too.
check("blocks a human co-author", () =>
  blocks([...empty, "-m", "fix: x\n\nCo-authored-by: Alice <alice@example.com>"]),
);
for (const [name, value] of [
  ["PI_CODING_AGENT", "true"],
  ["OMPCODE", "1"],
  ["CODEX_THREAD_ID", "x"],
] as const)
  check(`blocks in an agent session with ${name}`, () =>
    blocks([...empty, "-m", trailer], { [name]: value }),
  );

check("allows a plain message", () => allows([...empty, "-m", "fix: x"]));
check("allows a mention of the trailer inside a line", () =>
  allows([...empty, "-m", "docs: explain why the hook blocks Co-Authored-By: trailers"]),
);
check("allows the trailer outside an agent session", () => allows([...empty, "-m", trailer], {}));

// Fails closed: with no node on PATH, each agent commit blocks.
const bin = `${tmp}/bin`;
fs.mkdirSync(bin);
fs.symlinkSync(
  spawnSync("/bin/sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim(),
  `${bin}/git`,
);
check("blocks a commit when node is missing", () =>
  assert.match(
    blocks([...empty, "-m", "fix: x"], { ...claude, PATH: bin }).stderr,
    /needs node 23\.6 or later/,
  ),
);

if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
