/**
 * Self-check for ../main.ts: real commits in a temporary repository, with the
 * hook command from dot_config/git/config set through GIT_CONFIG_* variables.
 * HOME is a temporary folder that links to the hook folders of this repo, so
 * the check runs this source and not the deployed copy.
 *
 * Run: node test/check.ts, from the hook folder. Needs git and Prettier; the
 * Org case also needs Emacs, and the Terraform case terraform. Each skips
 * alone without its program.
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

for (const program of ["git", "prettier"])
  if (spawnSync(program, ["--version"]).error) {
    console.log(`SKIP no ${program} on PATH`);
    process.exit(0);
  }

// The fixture lives under $HOME, because the formatters skip /tmp and $TMPDIR.
const tmp = fs.mkdtempSync(path.join(os.homedir(), ".format-staged-test."));
const home = `${tmp}/home`;
for (const [link, target] of [
  [".config/git/hooks/format-staged-files", here],
  [".claude/hooks/format-prettier", `${repo}/dot_claude/hooks/format-prettier`],
  [
    ".claude/hooks/format-org-tables",
    `${repo}/dot_claude/hooks/format-org-tables`,
  ],
  [
    ".claude/hooks/format-terraform",
    `${repo}/dot_claude/hooks/format-terraform`,
  ],
]) {
  fs.mkdirSync(path.dirname(`${home}/${link}`), { recursive: true });
  fs.symlinkSync(target!, `${home}/${link}`);
}
// Git parses the value, as it does for ~/.config/git/config: a `;` outside
// quotes starts a comment.
const command = spawnSync(
  "git",
  [
    "config",
    "--file",
    `${repo}/dot_config/git/config`,
    "--get",
    "hook.claude-format-staged.command",
  ],
  { encoding: "utf8" },
).stdout.trim();
assert.ok(command, "no hook command in dot_config/git/config");

// No agent variable from the session that runs this check.
const base: Record<string, string | undefined> = { ...process.env };
for (const name of [
  "CLAUDECODE",
  "PI_CODING_AGENT",
  "OMPCODE",
  "CODEX_THREAD_ID",
])
  delete base[name];
Object.assign(base, {
  HOME: home,
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "hook.claude-format-staged.event",
  GIT_CONFIG_VALUE_0: "pre-commit",
  GIT_CONFIG_KEY_1: "hook.claude-format-staged.command",
  GIT_CONFIG_VALUE_1: command,
});
const work = `${tmp}/work`;
fs.mkdirSync(work);
const git = (
  args: string[],
  agent: Record<string, string> = { CLAUDECODE: "1" },
) => {
  const ran = spawnSync("git", args, {
    cwd: work,
    encoding: "utf8",
    env: { ...base, ...agent },
  });
  assert.equal(ran.status, 0, `git ${args.join(" ")}: ${ran.stderr}`);
  return ran;
};
const committed = (file: string) => git(["show", `HEAD:${file}`]).stdout;
const dirty = () => git(["status", "--porcelain"]).stdout;
const write = (file: string, text: string) =>
  fs.writeFileSync(`${work}/${file}`, text);

git(["init", "-q"]);
git(["commit", "-q", "--allow-empty", "-m", "init"]);

// Prettier rewrites a `*` bullet to `-`.
write("new.md", "*   one\n");
git(["add", "new.md"]);
let ran = git(["commit", "-q", "-m", "new"]);
check("a staged new file is committed formatted", () =>
  assert.equal(committed("new.md"), "- one\n"),
);
check("a restage is reported on stderr", () =>
  assert.equal(
    ran.stderr,
    "format-staged-files: reformatted and restaged new.md\n",
  ),
);
check("the tree is clean after the commit", () => assert.equal(dirty(), ""));

// Write and commit in one call, the case the PostToolUse formatters miss.
write("new.md", "*   two\n");
git(["commit", "-q", "-a", "-m", "commit -a"]);
check("commit -a formats the tracked file", () =>
  assert.equal(committed("new.md"), "- two\n"),
);
check("the tree is clean after commit -a", () => assert.equal(dirty(), ""));

// A file with unstaged changes stays as staged, and the unstaged part stays out.
write("new.md", "*   three\n");
git(["add", "new.md"]);
write("new.md", "*   three\n*   unstaged\n");
git(["commit", "-q", "-m", "partial"]);
check("a partly staged file is committed as staged", () =>
  assert.equal(committed("new.md"), "*   three\n"),
);
check("the unstaged change stays in the tree", () =>
  assert.equal(
    fs.readFileSync(`${work}/new.md`, "utf8"),
    "*   three\n*   unstaged\n",
  ),
);
git(["checkout", "-q", "--", "new.md"]);

if (spawnSync("emacs", ["--version"]).error)
  console.log("SKIP no emacs on PATH: Org case");
else {
  write("t.org", "| a | bbbb |\n| cccc | d |\n");
  git(["add", "t.org"]);
  git(["commit", "-q", "-m", "org"]);
  check("an Org table is committed aligned", () =>
    assert.equal(committed("t.org").split("\n")[0], "| a    | bbbb |"),
  );
}

if (spawnSync("terraform", ["version"]).error)
  console.log("SKIP no terraform on PATH: Terraform case");
else {
  write("main.tf", "a   = 1\nbb = 2\n");
  git(["add", "main.tf"]);
  git(["commit", "-q", "-m", "tf"]);
  check("a Terraform file is committed formatted", () =>
    assert.equal(committed("main.tf"), "a  = 1\nbb = 2\n"),
  );
}

// A file no formatter handles is committed as it is, and not reported.
write("a.txt", "x  =  1\n");
git(["add", "a.txt"]);
ran = git(["commit", "-q", "-m", "txt"]);
check("a file no formatter handles is unchanged", () =>
  assert.equal(committed("a.txt"), "x  =  1\n"),
);
check("an unchanged file is not reported", () => assert.equal(ran.stderr, ""));

// A symlink is committed as it is.
fs.symlinkSync("new.md", `${work}/link.md`);
git(["add", "link.md"]);
git(["commit", "-q", "-m", "link"]);
check("a symlink stays a symlink", () =>
  assert.ok(fs.lstatSync(`${work}/link.md`).isSymbolicLink()),
);

// Each agent turns the hook on; a commit with none of them is not formatted.
for (const [name, value] of [
  ["PI_CODING_AGENT", "true"],
  ["OMPCODE", "1"],
  ["CODEX_THREAD_ID", "019a0000-0000-7000-8000-000000000000"],
] as const) {
  write("new.md", `*   ${name}\n`);
  git(["commit", "-q", "-a", "-m", name], { [name]: value });
  check(`${name} turns the hook on`, () =>
    assert.equal(committed("new.md"), `- ${name}\n`),
  );
}
write("new.md", "*   four\n");
git(["commit", "-q", "-a", "-m", "no agent"], {});
check("a commit outside an agent is not formatted", () =>
  assert.equal(committed("new.md"), "*   four\n"),
);

// With no node on PATH the hook command stops at once, and the commit goes on.
const bin = `${tmp}/bin`;
fs.mkdirSync(bin);
fs.symlinkSync(
  spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim(),
  `${bin}/git`,
);
write("new.md", "*   five\n");
ran = git(["commit", "-q", "-a", "-m", "no node"], {
  CLAUDECODE: "1",
  PATH: `${bin}:/usr/bin:/bin`,
});
check("a commit with no node on PATH goes on, with no output", () => {
  assert.equal(committed("new.md"), "*   five\n");
  assert.equal(ran.stderr, "");
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) {
  console.error(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all pass");
