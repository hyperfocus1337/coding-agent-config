/**
 * Git pre-commit hook, not an agent hook: formats the staged files through
 * the command.ts of format-prettier, format-org-tables, and
 * format-terraform, then stages the result, so the commit holds the
 * formatted text. A Bash command that
 * writes a file and commits it in one call gets past the PostToolUse
 * formatters, which run after the commit. ~/.config/git/config sets this hook
 * for every commit, and the gate below limits it to agent sessions. Never
 * stops a commit: always exits 0. Design notes: README.md.
 *
 * Run: node main.ts, from git as a pre-commit hook.
 */

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

// Each agent sets its own variable in the processes it starts. Your own
// commits do not get the hook.
const env = process.env;
const agent =
  env.CLAUDECODE === "1" ||
  env.PI_CODING_AGENT === "true" ||
  env.OMPCODE === "1" ||
  !!env.CODEX_THREAD_ID;
if (!agent) process.exit(0);

const git = (...args: string[]) =>
  spawnSync("git", args, { cwd: root, encoding: "utf8" });
// Git runs a pre-commit hook at the root already. `git hook run` from a
// subfolder does not, and the formatters find .prettierignore from here.
let root = process.cwd();
const top = git("rev-parse", "--show-toplevel");
if (top.status !== 0) process.exit(0);
root = top.stdout.trim();

const hooks = `${homedir()}/.claude/hooks`;
const read = (file: string) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};

// --cached reads $GIT_INDEX_FILE, so `commit -a` and `commit <path>`, which
// build a temporary index, get the files they are about to commit. Each
// child gets the git variables through the environment.
// shortcut: one formatter run for each file, about 0.4 s each for Prettier.
// The upgrade is a list mode in format-prettier, so one Prettier run
// takes every file.
const staged = git(
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMR",
  "-z",
);
for (const rel of staged.stdout.split("\0")) {
  if (!rel) continue;
  const file = `${root}/${rel}`;
  try {
    if (!lstatSync(file).isFile()) continue; // a symlink or a folder
  } catch {
    continue;
  }
  // Unstaged changes in the same file: `git add` would commit those too.
  if (git("diff", "--quiet", "--", rel).status !== 0) continue;
  const before = read(file);
  const payload = JSON.stringify({
    hook_event_name: "PostToolUse",
    cwd: root,
    tool_input: { file_path: file },
  });
  for (const formatter of [
    "format-prettier",
    "format-org-tables",
    "format-terraform",
  ])
    spawnSync(process.execPath, [`${hooks}/${formatter}/command.ts`], {
      cwd: root,
      // /toggle-hook turns off the agent hooks only, not this commit-time
      // format. Node leaves an undefined variable out.
      env: { ...env, CLAUDE_HOOKS_DISABLE: undefined },
      input: payload,
      stdio: ["pipe", "ignore", "ignore"],
    });
  if (read(file) === before) continue;
  git("add", "--", rel);
  // Git passes pre-commit stderr through, also with `commit -q`. Without this
  // line, a changed file size is the only trace of the restage.
  process.stderr.write(
    `format-staged-files: reformatted and restaged ${rel}\n`,
  );
}
