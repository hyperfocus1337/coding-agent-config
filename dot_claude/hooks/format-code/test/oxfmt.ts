/**
 * Integration cases for formatters/oxfmt.ts through command.ts, with the real git and oxfmt: the
 * Bash sweep, the amend hint, the extensions of an edit, and the config lookup. check.ts runs them.
 * Without oxfmt they skip with a message.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { bash, check, edit, git, has, hint, quiet, read, tmp } from "./harness.ts";

if (has("oxfmt")) await cases();
else console.log("SKIP oxfmt: no oxfmt on PATH");

async function cases() {
  /** A table oxfmt realigns: cells of unequal width, no padding yet. */
  const RAW = "| a | bbbbbbbbbbbb |\n| --- | --- |\n| ccccccccccccccc | d |\n";
  /** 111 characters: longer than 100, the width of the oxfmt defaults. */
  const LONG =
    "const x = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5, zeta: 6, eta: 7, theta: 8, iota: 9, kappa: 10 };\n";
  const unaligned = (file: string) => fs.writeFileSync(file, RAW);
  const aligned = (file: string) => assert.match(read(file), /^\| a {2}/);
  const wrapped = (file: string) => assert.match(read(file), /^ {2}alpha: 1,$/m);
  const formatted = (what: string, file: string) => check(`format ${what}`, () => aligned(file));
  const unchanged = (what: string, file: string, text: string) =>
    check(`skip ${what}`, () => assert.equal(read(file), text));

  // --- The Bash sweep ---

  // Fixture: outer repo, a plain subdir, an embedded repo, an embedded repo
  // inside that one, a worktree, and a submodule made dirty by an extra row.
  const sub = `${tmp}/sub`;
  fs.mkdirSync(sub);
  git(sub, "init", "-q");
  unaligned(`${sub}/SUB.md`);
  git(sub, "add", "-A");
  git(sub, "commit", "-qm", "seed");

  const outer = `${tmp}/outer`;
  fs.mkdirSync(`${outer}/plain`, { recursive: true });
  fs.mkdirSync(`${outer}/nested/deeper`, { recursive: true });
  git(outer, "init", "-q");
  git(outer, "commit", "-q", "--allow-empty", "-m", "seed");
  git(outer, "-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "submod");
  git(outer, "commit", "-qm", "submod");
  git(`${outer}/nested`, "init", "-q");
  git(`${outer}/nested/deeper`, "init", "-q");
  git(outer, "worktree", "add", "-q", `${outer}/.worktrees/feat`, "-b", "feat");
  for (const file of [
    "OUTER.md",
    "plain/P.md",
    "nested/NESTED.md",
    "nested/deeper/DEEP.md",
    ".worktrees/feat/WT.md",
  ])
    unaligned(`${outer}/${file}`);
  fs.writeFileSync(`${outer}/submod/SUB.md`, `${RAW}| e | f |\n`);
  // Non-Markdown the sweep must leave alone, ignored Markdown it must not see,
  // and a symlink back to a root, which the queue must not follow forever.
  fs.writeFileSync(`${outer}/code.ts`, "const a  =  1\n");
  fs.writeFileSync(`${outer}/data.json`, '{"a":1,   "b":2}\n');
  fs.mkdirSync(`${outer}/vendor`);
  fs.writeFileSync(`${outer}/.gitignore`, "vendor/\n");
  unaligned(`${outer}/vendor/V.md`);
  fs.symlinkSync(".", `${outer}/self`);
  // A table whose padded width passes 100 columns, and one sentence per line:
  // under proseWrap never, the sentences join.
  fs.writeFileSync(
    `${outer}/WIDE.md`,
    "| first-column-heading-here-and-more | second-column-heading-x-and-more | third-column-heading-yz-and-more |\n| --- | --- | --- |\n| first-column-cell-value | second-column-cell-value | third-column-cell-value |\n\nThe first sentence stays on its own line.\nThe second sentence also stays on its own line.\n",
  );

  // The command names no path, so only the queue finds the roots.
  await quiet("sweep: ends with a symlink back to a root", bash(outer, "echo x"));
  await formatted("root", `${outer}/OUTER.md`);
  await formatted("plain subdir", `${outer}/plain/P.md`);
  await formatted("embedded repo", `${outer}/nested/NESTED.md`);
  await formatted("embedded repo at depth 2", `${outer}/nested/deeper/DEEP.md`);
  await formatted("dirty submodule", `${outer}/submod/SUB.md`);
  await formatted("worktree in the repo", `${outer}/.worktrees/feat/WT.md`);
  await unchanged("sweep leaves .ts", `${outer}/code.ts`, "const a  =  1\n");
  await unchanged("sweep leaves .json", `${outer}/data.json`, '{"a":1,   "b":2}\n');
  await unchanged("ignored Markdown", `${outer}/vendor/V.md`, RAW);
  await check("prose wrap: a wide table stays padded", () =>
    assert.match(read(`${outer}/WIDE.md`), /^\| -{8}/m),
  );
  await check("prose wrap: sentence lines are kept", () =>
    assert.match(read(`${outer}/WIDE.md`), /^The second sentence also stays on its own line\.$/m),
  );

  // A repo with no commits has no HEAD, so `git diff HEAD` fails. Untracked
  // Markdown must still be swept, with no git error on the output.
  const fresh = `${tmp}/fresh`;
  fs.mkdirSync(fresh);
  git(fresh, "init", "-q");
  unaligned(`${fresh}/NEW.md`);
  await quiet("no-HEAD repo: prints nothing", bash(fresh, "echo x"));
  await formatted("repo with no HEAD", `${fresh}/NEW.md`);

  // A cwd outside any repo exits clean, and a file the command names still
  // formats.
  fs.mkdirSync(`${tmp}/norepo`);
  unaligned(`${tmp}/norepo/N.md`);
  await quiet("non-repo cwd", bash(`${tmp}/norepo`, "cat > N.md <<EOF\nx\nEOF"));
  await formatted("named file outside any repo", `${tmp}/norepo/N.md`);

  // A Markdown file in a second repo, reached only by an absolute path.
  const other = `${tmp}/other`;
  fs.mkdirSync(other);
  git(other, "init", "-q");
  git(other, "commit", "-q", "--allow-empty", "-m", "seed");
  unaligned(`${other}/OTHER.md`);
  await quiet("cross-repo sweep", bash(outer, `cat > ${other}/OTHER.md <<EOF\nx\nEOF`));
  await formatted("cross-repo absolute path", `${other}/OTHER.md`);

  // A named file is formatted even when git cannot see it: a file written and
  // ignored in the same call is already ignored when the hook runs.
  unaligned(`${outer}/vendor/NAMED.md`);
  bash(outer, "cat > vendor/NAMED.md <<EOF\nx\nEOF");
  await formatted("ignored file named in the command", `${outer}/vendor/NAMED.md`);

  // .prettierignore still wins: that one is a formatting decision.
  fs.writeFileSync(`${outer}/.prettierignore`, "PIGNORED.md\n");
  unaligned(`${outer}/PIGNORED.md`);
  bash(outer, "cat > PIGNORED.md <<EOF\nx\nEOF");
  await unchanged("file in .prettierignore", `${outer}/PIGNORED.md`, RAW);

  unaligned(`${outer}/vendor/REL.md`);
  bash(outer, "sed -i s/a/b/ vendor/REL.md");
  await formatted("relative path named in the command", `${outer}/vendor/REL.md`);

  // Parent-relative paths must not make oxfmt reject the whole batch.
  unaligned(`${outer}/vendor/PARENT.md`);
  unaligned(`${outer}/BATCH.md`);
  await quiet("parent-relative Bash path", bash(`${outer}/plain`, "echo ../vendor/PARENT.md"));
  await formatted("parent-relative path named in Bash", `${outer}/vendor/PARENT.md`);
  await formatted("other file in the same Bash batch", `${outer}/BATCH.md`);

  await quiet("a named path that does not exist", bash(outer, "rm gone.md"));

  // Write and commit in one call leaves a clean tree. With `git commit` in the
  // command, the sweep also covers the last commit and gives the amend hint.
  const committed = `${tmp}/committed`;
  fs.mkdirSync(committed);
  git(committed, "init", "-q");
  git(committed, "commit", "-q", "--allow-empty", "-m", "seed");
  unaligned(`${committed}/C.md`);
  git(committed, "add", "-A");
  git(committed, "commit", "-qm", "docs");
  let ran = bash(committed, "git add -A && git commit -m docs && git push");
  await formatted("file committed in the same command", `${committed}/C.md`);
  await check("hint: amend hint after a commit sweep", () => {
    assert.match(hint(ran)?.additionalContext ?? "", /^oxfmt reformatted/);
    assert.match(hint(ran)?.additionalContext ?? "", /amend/);
    assert.match(hint(ran)?.additionalContext ?? "", /C\.md/);
  });

  // `git -C <dir> commit` also commits, so the sweep covers the last commit.
  unaligned(`${committed}/G.md`);
  git(committed, "add", "-A");
  git(committed, "commit", "-qm", "dash-c");
  ran = bash(committed, `git -C ${committed} commit -m dash-c`);
  await check("hint: also after git -C <dir> commit", () =>
    assert.match(hint(ran)?.additionalContext ?? "", /G\.md/),
  );

  // The failure event: the hint names the event that fired.
  unaligned(`${committed}/F.md`);
  git(committed, "add", "-A");
  git(committed, "commit", "-qm", "more");
  ran = bash(committed, "git add -A && git commit -m more && just fmt-check", {
    hook_event_name: "PostToolUseFailure",
    error: "exit 1",
  });
  await formatted("file committed by a command that then failed", `${committed}/F.md`);
  await check("hint: names the event that fired", () =>
    assert.equal(hint(ran)?.hookEventName, "PostToolUseFailure"),
  );

  unaligned(`${committed}/D.md`);
  await quiet("hint: none without a commit", bash(committed, "echo x"));

  // An uncommitted file the sweep formats is not named: an amend would not fix it.
  git(committed, "commit", "-q", "--allow-empty", "-m", "other");
  unaligned(`${committed}/E.md`);
  ran = bash(committed, "git commit -m other");
  await formatted("uncommitted file in a commit sweep", `${committed}/E.md`);
  await quiet("hint: none for a file the commit does not hold", ran);

  // A commit whose Markdown oxfmt leaves as it is needs no amend.
  git(committed, "add", "-A");
  git(committed, "commit", "-qm", "formatted");
  await quiet("hint: none when oxfmt changed nothing", bash(committed, "git commit -m formatted"));

  // A repo with one commit has no HEAD~1, and the hint still comes.
  const first = `${tmp}/first`;
  fs.mkdirSync(first);
  git(first, "init", "-q");
  unaligned(`${first}/R.md`);
  git(first, "add", "-A");
  git(first, "commit", "-qm", "root");
  ran = bash(first, "git add -A && git commit -m root");
  await check("hint: also for the first commit of a repo", () =>
    assert.match(hint(ran)?.additionalContext ?? "", /R\.md/),
  );

  // --- A Write or Edit: one named file, by extension ---

  for (const name of ["edited.ts", "edited.mts", "edited.cts"]) {
    fs.writeFileSync(`${outer}/${name}`, "const a  =  1\n");
    await quiet(`edit ${name}: prints nothing`, edit(`${outer}/${name}`));
    await unchanged(`edit formats ${name}`, `${outer}/${name}`, "const a = 1;\n");
  }
  // oxfmt formats these, Prettier did not.
  for (const [name, raw, done] of [
    ["a.toml", "a  =  1\n", "a = 1\n"],
    ["a.jsonc", '{"a":1,   "b":2}\n', '{ "a": 1, "b": 2 }\n'],
  ] as const) {
    fs.writeFileSync(`${outer}/${name}`, raw);
    edit(`${outer}/${name}`);
    await unchanged(`edit formats ${name}`, `${outer}/${name}`, done);
  }
  fs.writeFileSync(`${outer}/notes.txt`, "a  =  1\n");
  edit(`${outer}/notes.txt`);
  await unchanged("edit leaves a file that no formatter takes", `${outer}/notes.txt`, "a  =  1\n");
  // A file in a temp folder is a scratch file, not project code.
  const scratch = `${process.env.TMPDIR || "/tmp"}/format-hook-scratch.md`;
  unaligned(scratch);
  edit(scratch);
  await unchanged("edit leaves a temp file", scratch, RAW);
  fs.rmSync(scratch);
  // A TMPDIR that is only a name prefix of the folder, not a parent, does not skip it.
  unaligned(`${outer}/sibling.md`);
  edit(`${outer}/sibling.md`, { TMPDIR: `${outer}/sib` });
  await formatted("a file next to TMPDIR with the same name prefix", `${outer}/sibling.md`);
  await quiet("edit: a file that does not exist", edit(`${outer}/gone.md`));

  // --- Config ---

  fs.mkdirSync(`${outer}/own`);
  fs.writeFileSync(`${outer}/wide.ts`, LONG);
  edit(`${outer}/wide.ts`);
  await check("config: a file with no oxfmt config gets width 100", () =>
    wrapped(`${outer}/wide.ts`),
  );
  fs.writeFileSync(`${outer}/own/.oxfmtrc.json`, '{ "printWidth": 120 }\n');
  fs.writeFileSync(`${outer}/own/wide.ts`, LONG);
  edit(`${outer}/own/wide.ts`);
  await unchanged("config: the nearest oxfmt config wins", `${outer}/own/wide.ts`, LONG);
}
