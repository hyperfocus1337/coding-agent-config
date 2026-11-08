/**
 * Integration cases for formatters/org-tables.ts through command.ts, with the real git and Emacs:
 * the alignment, the Bash sweep, and the amend hint. check.ts runs them. Without Emacs they skip
 * with a message.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { bash, check, edit, git, has, quiet, read, tmp as root } from "./harness.ts";

if (has("emacs")) await cases();
else console.log("SKIP org-tables: no emacs on PATH");

async function cases() {
  const tmp = `${root}/org`;
  fs.mkdirSync(tmp);
  /** A table Org realigns: cells of unequal width, no padding yet. */
  const RAW = "| a | bbbbbbbbbbbb |\n|---+---|\n| ccccccccccccccc | d |\n";
  const unaligned = (file: string) => fs.writeFileSync(file, RAW);
  /** Aligned: the first cell is padded to the width of the widest one. */
  const isAligned = (file: string) => assert.match(read(file), /^\| a {2}/);
  const aligned = (what: string, file: string) => check(`align ${what}`, () => isAligned(file));
  const untouched = (what: string, file: string) =>
    check(`skip ${what}`, () => assert.match(read(file), /^\| a \| b/));

  // --- A Write or Edit ---

  unaligned(`${tmp}/edit.org`);
  await quiet("edit: prints nothing", edit(`${tmp}/edit.org`));
  await aligned("the file the payload names", `${tmp}/edit.org`);

  unaligned(`${tmp}/not-org.txt`);
  edit(`${tmp}/not-org.txt`);
  await untouched("a file that no formatter takes", `${tmp}/not-org.txt`);

  await quiet("a file that does not exist", edit(`${tmp}/missing.org`));

  const once = read(`${tmp}/edit.org`);
  edit(`${tmp}/edit.org`);
  await check("align: a second pass changes nothing", () =>
    assert.equal(read(`${tmp}/edit.org`), once),
  );

  await check("clean: no backup files left behind", () =>
    assert.deepEqual(
      fs.readdirSync(tmp).filter((file) => file.endsWith("~")),
      [],
    ),
  );

  // A file in a temp folder is a scratch file, not project prose.
  const scratch = `${process.env.TMPDIR || "/tmp"}/org-hook-scratch.org`;
  unaligned(scratch);
  edit(scratch);
  await untouched("a file in a temp folder", scratch);
  fs.rmSync(scratch);
  // A TMPDIR that is only a name prefix of the folder, not a parent, does not skip it.
  // Emacs inherits TMPDIR, so it must be a folder that exists, as in a session.
  fs.mkdirSync(`${tmp}/sib`);
  unaligned(`${tmp}/sibling.org`);
  edit(`${tmp}/sibling.org`, { TMPDIR: `${tmp}/sib` });
  await aligned("a file next to TMPDIR with the same name prefix", `${tmp}/sibling.org`);

  // A | line inside a block is not a table: org-at-table-p decides.
  fs.writeFileSync(
    `${tmp}/block.org`,
    "#+begin_example\n| a | bbbbbbbbbbbb |\n| ccccccccccccccc | d |\n#+end_example\n",
  );
  edit(`${tmp}/block.org`);
  await check("skip a | line inside a block", () =>
    assert.match(read(`${tmp}/block.org`), /^\| a \| b/m),
  );

  // Alignment only: a TBLFM formula is not evaluated, so the sum stays 0.
  fs.writeFileSync(`${tmp}/formula.org`, "| 2 | 3 | 0 |\n#+TBLFM: $3=$1+$2\n");
  edit(`${tmp}/formula.org`);
  await check("align: a TBLFM formula is not evaluated", () =>
    assert.match(read(`${tmp}/formula.org`), /\| *2 \| *3 \| *0 \|/),
  );

  // A link counts at its raw width, so each | is at the same column in a diff.
  fs.writeFileSync(`${tmp}/link.org`, "| a | see [[*Cache][Cache]] |\n| b | x |\n");
  edit(`${tmp}/link.org`);
  await check("align: a link counts at its raw width", () => {
    const widths = read(`${tmp}/link.org`)
      .trimEnd()
      .split("\n")
      .map((line) => line.length);
    assert.equal(new Set(widths).size, 1, read(`${tmp}/link.org`));
  });

  // --- A Bash call ---

  const repo = `${tmp}/org-repo`;
  fs.mkdirSync(`${repo}/docs`, { recursive: true });
  git(repo, "init", "-q");
  unaligned(`${repo}/docs/heredoc.org`);
  bash(repo, "cat > docs/heredoc.org <<'EOF'\n| a | b |\nEOF");
  await aligned("a relative path, against the payload cwd", `${repo}/docs/heredoc.org`);

  // The payload cwd is the one from before the command, so a relative path
  // after a cd does not resolve against it. The sweep of the repository finds
  // the file.
  fs.mkdirSync(`${repo}/pkg/sub`, { recursive: true });
  unaligned(`${repo}/pkg/after-cd.org`);
  bash(`${repo}/docs`, `cd ${repo}/pkg && python3 - <<'EOF'\np='after-cd.org'\nEOF`);
  await aligned("a relative path after an absolute cd", `${repo}/pkg/after-cd.org`);

  unaligned(`${repo}/pkg/sub/two-cds.org`);
  bash(repo, `cd "pkg" && cd sub/ && sed -i '' s/x/y/ two-cds.org`);
  await aligned("a relative path after two relative cds", `${repo}/pkg/sub/two-cds.org`);

  // The sweep also takes a file that the call changed without a name for it,
  // such as one that a script wrote.
  unaligned(`${repo}/generated.org`);
  bash(repo, "./generate.sh");
  await aligned("a changed file that the command does not name", `${repo}/generated.org`);

  unaligned(`${repo}/one.org`);
  unaligned(`${repo}/two.org`);
  bash(repo, `sed -i '' s/x/y/ ${repo}/one.org && sed -i '' s/x/y/ ${repo}/two.org`);
  await aligned("the first of two files in one command", `${repo}/one.org`);
  await aligned("the second of two files in one command", `${repo}/two.org`);

  unaligned(`${repo}/prose.txt`);
  bash(repo, `printf x > ${repo}/prose.txt`);
  await untouched("a command that names no .org path", `${repo}/prose.txt`);

  await quiet("a named path that does not exist", bash(repo, `rm ${repo}/gone.org`));

  // Write and commit in one call: the commit holds the unaligned file, so the
  // hook names the file in the amend hint.
  unaligned(`${repo}/committed.org`);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  let ran = bash(repo, `cat > ${repo}/committed.org <<'EOF'\nEOF\ngit commit -am docs`);
  await aligned("a file the command committed", `${repo}/committed.org`);
  await check("hint: names the file", () => {
    const out = JSON.parse(ran.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(out.hookSpecificOutput.additionalContext, /committed\.org/);
  });

  // `git -C <dir> commit` also commits, so the hint comes.
  unaligned(`${repo}/dash-c.org`);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "dash-c");
  ran = bash(repo, `touch ${repo}/dash-c.org && git -C ${repo} commit -am docs`);
  await check("hint: also after git -C <dir> commit", () =>
    assert.match(ran.stdout, /dash-c\.org/),
  );

  // A path the command only read stays as it is: its old mtime says so.
  unaligned(`${repo}/read-only.org`);
  fs.utimesSync(`${repo}/read-only.org`, new Date(2020, 0, 1), new Date(2020, 0, 1));
  bash(repo, `sed -n '1,2p' ${repo}/read-only.org > ${repo}/copy.org`);
  await untouched("a path the command only read", `${repo}/read-only.org`);

  // Another session's edit leaves the tree dirty while Emacs changed nothing,
  // so there is nothing to amend.
  unaligned(`${repo}/settled.org`);
  edit(`${repo}/settled.org`);
  git(repo, "add", "settled.org");
  git(repo, "commit", "-qm", "settled");
  fs.appendFileSync(`${repo}/settled.org`, "a line another session wrote\n");
  await quiet(
    "hint: none for a file Emacs left as it was",
    bash(repo, `git add ${repo}/settled.org && git commit -m settled`),
  );

  unaligned(`${repo}/quiet.org`);
  ran = bash(repo, `cat > ${repo}/quiet.org <<'EOF'\nEOF`);
  await quiet("hint: none without a commit", ran);
  await aligned("a file written with no commit", `${repo}/quiet.org`);
}
