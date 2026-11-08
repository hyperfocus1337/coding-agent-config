/**
 * The shared parts of the integration checks in check.ts, oxfmt.ts, and org-tables.ts: the
 * fixture folder, git with a clean config, and the runs of command.ts. Fixtures live under $HOME,
 * because the hook skips /tmp and $TMPDIR.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const hook = path.dirname(import.meta.dirname);
// A hook that /toggle-hook turned off in the agent that runs this check still runs here.
delete process.env.AGENT_HOOKS_DISABLE;

let failures = 0;
export async function check(what: string, run: () => void | Promise<void>) {
  try {
    await run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${what}\n  ${(error as Error).message}`);
  }
}

/** Whether `program` is on PATH. Without it, the hook leaves its files as they are. */
export const has = (program: string) => !spawnSync(program, ["--version"]).error;

if (!has("git")) {
  console.log("SKIP no git on PATH");
  process.exit(0);
}

export const tmp = fs.mkdtempSync(path.join(os.homedir(), ".format-code-test."));
// The git config of the person who runs the check stays out, and the format-staged-files
// pre-commit hook is off: it formats the file before the commit, and then nothing is left to
// amend. In process.env, so that the hook and the stubs of the adapters get it too.
fs.writeFileSync(`${tmp}/gitconfig`, "");
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: `${tmp}/gitconfig`,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "hook.format-staged-files.enabled",
  GIT_CONFIG_VALUE_0: "false",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
});
export const git = (cwd: string, ...args: string[]) => {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(ran.status, 0, `git ${args.join(" ")}: ${ran.stderr}`);
};

/** Runs command.ts with a payload; the timeout turns a hung formatter into a failure. */
export const hookRun = (payload: object, env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [path.join(hook, "command.ts")], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
export const bash = (cwd: string, command: string, extra: object = {}) =>
  hookRun({ cwd, tool_input: { command }, ...extra });
export const edit = (file: string, env?: Record<string, string>) =>
  hookRun({ cwd: path.dirname(file), tool_input: { file_path: file } }, env);

export const read = (file: string) => fs.readFileSync(file, "utf8");
export const quiet = (what: string, ran: ReturnType<typeof hookRun>) =>
  check(what, () => {
    assert.equal(ran.status, 0, ran.stderr);
    assert.equal(ran.stdout + ran.stderr, "");
  });
/** The hookSpecificOutput of a run, if it printed one. */
export const hint = (
  ran: ReturnType<typeof hookRun>,
): { hookEventName: string; additionalContext: string } | undefined =>
  ran.stdout ? JSON.parse(ran.stdout).hookSpecificOutput : undefined;

/** Removes the fixtures and sets the exit code. */
export function finish() {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    console.error(`${failures} failed`);
    process.exitCode = 1;
  } else console.log("all pass");
}
