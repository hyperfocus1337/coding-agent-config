/**
 * Git pre-commit hook, not an agent hook: formats the staged files through
 * the command.ts of format-prettier, format-org-tables, and format-code,
 * then stages the result, so the commit holds the formatted text. A Bash
 * command that writes a file and commits it in one call gets past the
 * PostToolUse formatters, which run after the commit. ~/.config/git/config
 * sets this hook for every commit, and the gate below limits it to agent
 * sessions. Never stops a commit: always exits 0. Design notes: README.md.
 *
 * Run: node main.ts, from git as a pre-commit hook, and
 * node main.ts post-commit, from git as a post-commit hook.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

// Each agent sets its own variable in the processes it starts. Your own
// commits do not get the hook.
const env = process.env;
const agent =
  env.CLAUDECODE === "1" ||
  env.PI_CODING_AGENT === "true" ||
  env.OMPCODE === "1" ||
  !!env.CODEX_THREAD_ID;
if (!agent) process.exit(0);

// --literal-pathspecs: a file named `*.md` names that file only.
const git = (args: string[], input?: string) =>
  spawnSync("git", ["--literal-pathspecs", ...args], {
    cwd: root,
    encoding: "utf8",
    input,
  });
// Git runs a pre-commit hook at the root already. `git hook run` from a
// subfolder does not, and the formatters find .prettierignore from here.
let root = process.cwd();
const top = git(["rev-parse", "--show-toplevel"]);
if (top.status !== 0) process.exit(0);
root = top.stdout.trim();
const fields = (out: string) => out.split("\0").filter(Boolean);
const fromStdin = ["--pathspec-from-file=-", "--pathspec-file-nul"];

const read = (file: string) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};

// The files the pre-commit run restaged, as `<blob before>\0<path>\0`. In
// the git folder, so each worktree has its own.
const record = resolve(
  root,
  git(["rev-parse", "--git-path", "format-staged-files"]).stdout.trim(),
);

// `git commit <path>` commits a temporary index, so the restage misses the
// real index, and `git status` shows the file as MM. Git writes the real
// index before post-commit, and gives this run that index. Put back the
// HEAD version of each restaged file whose entry still holds the blob from
// before the format.
if (process.argv[2] === "post-commit") {
  const entries = fields(read(record) ?? "");
  rmSync(record, { force: true });
  const stale: string[] = [];
  for (let i = 0; i + 1 < entries.length; i += 2) {
    const [blob, rel] = [entries[i]!, entries[i + 1]!];
    if (
      git(["rev-parse", "-q", "--verify", `:0:${rel}`]).stdout.trim() === blob
    )
      stale.push(rel);
  }
  if (stale.length) git(["reset", "-q", ...fromStdin], stale.join("\0"));
  process.exit(0);
}

rmSync(record, { force: true });
// --cached reads $GIT_INDEX_FILE, so `commit -a` and `commit <path>`, which
// build a temporary index, get the files they are about to commit. Each
// child gets the git variables through the environment. --raw gives the
// mode and the blob of the index side.
const staged = fields(
  git([
    "diff",
    "--cached",
    "--raw",
    "-z",
    "--no-abbrev",
    "--no-renames",
    "--diff-filter=ACM",
  ]).stdout,
);
// Unstaged changes in a file: `git add` would commit those too.
const unstaged = new Set(fields(git(["diff", "--name-only", "-z"]).stdout));
const blobs = new Map<string, string>();
for (let i = 0; i + 1 < staged.length; i += 2) {
  // `:<old mode> <new mode> <old blob> <new blob> <status>`. A regular file
  // has mode 100644 or 100755. A symlink or a submodule does not.
  const [, mode = "", , blob = ""] = staged[i]!.split(" ");
  const rel = staged[i + 1]!;
  if (mode.startsWith("100") && !unstaged.has(rel)) blobs.set(rel, blob);
}
if (!blobs.size) process.exit(0);

const files = [...blobs.keys()];
const before = files.map((rel) => read(`${root}/${rel}`));
// One run of each formatter for all files. file_paths is not in an agent
// payload: the formatters take it from this hook only.
const payload = JSON.stringify({
  hook_event_name: "PostToolUse",
  cwd: root,
  tool_input: { file_paths: files.map((rel) => `${root}/${rel}`) },
});
const hooks = `${homedir()}/.claude/hooks`;
for (const formatter of ["format-prettier", "format-org-tables", "format-code"])
  spawnSync(process.execPath, [`${hooks}/${formatter}/command.ts`], {
    cwd: root,
    // /toggle-hook turns off the agent hooks only, not this commit-time
    // format. Node leaves an undefined variable out.
    env: { ...env, AGENT_HOOKS_DISABLE: undefined },
    input: payload,
    stdio: ["pipe", "ignore", "ignore"],
  });

const changed = files.filter((rel, i) => read(`${root}/${rel}`) !== before[i]);
if (!changed.length) process.exit(0);
git(["add", ...fromStdin], changed.join("\0"));
writeFileSync(
  record,
  changed.map((rel) => `${blobs.get(rel)}\0${rel}\0`).join(""),
);
// Git passes pre-commit stderr through, also with `commit -q`. Without these
// lines, a changed file size is the only trace of the restage.
for (const rel of changed)
  process.stderr.write(
    `format-staged-files: reformatted and restaged ${rel}\n`,
  );
