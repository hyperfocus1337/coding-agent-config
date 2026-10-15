/**
 * Self-check for ../core.ts and ../hook.ts. The parsers run in-process. The
 * hook runs as a child process with a scratch HOME, around file changes in
 * scratch git repos, as an agent runs it.
 *
 * Run: node test/check.ts, from the hook directory.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  changedLine,
  headerPath,
  hunkLine,
  lineEndings,
  patchFiles,
  patchLine,
  prune,
  rebuildOriginal,
  writeBlob,
  type Hunk,
} from "../core.ts";

let checks = 0;
function check(what: string, run: () => void): void {
  checks += 1;
  try {
    run();
  } catch (error) {
    console.error(
      `FAIL ${what}\n  ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

// ── Parsers ───────────────────────────────────────────────────────────────────

check("Edit: new start plus the context lines before the change", () => {
  // The structuredPatch of a real Edit of line 3, from the probe of 2026-10-14.
  const hunk = {
    newStart: 1,
    lines: [" one", " two", "-three", "+THREE", " four", " five"],
  };
  assert.equal(patchLine([hunk]), 3);
});

check("Write that appends: the first + line", () => {
  assert.equal(
    patchLine([
      { newStart: 3, lines: [" THREE", " four", " five", "+", "+six"] },
    ]),
    6,
  );
});

check("Write that creates a file has no hunks: line 1", () => {
  assert.equal(patchLine([]), 1);
});

check("pi write: the first line that differs, none when equal", () => {
  assert.equal(changedLine("a\nb\nc\n", "a\nB\nc\n"), 2);
  assert.equal(changedLine("a\nb\n", "a\nb\nc\n"), 3);
  assert.equal(changedLine("a\nb\nc\n", "a\nb\n"), 3);
  assert.equal(changedLine("", "x\n"), 1);
  assert.equal(changedLine("a\n", "a\n"), undefined);
});

check("-U0 hunk: the new start, or the line after a pure deletion", () => {
  assert.equal(hunkLine("@@ -3 +3 @@"), 3);
  assert.equal(hunkLine("@@ -4,0 +5,2 @@ context"), 5);
  assert.equal(hunkLine("@@ -5,2 +4,0 @@"), 5);
  assert.equal(hunkLine("@@ -0,0 +1,3 @@"), 1);
});

check("diff header: plain, with spaces, and C-quoted", () => {
  assert.equal(headerPath("diff --git a/dir/x.txt b/dir/x.txt"), "dir/x.txt");
  assert.equal(headerPath("diff --git a/a b/c.txt b/a b/c.txt"), "a b/c.txt");
  assert.equal(
    headerPath('diff --git "a/t\\tab\\"q\\303\\251" "b/t\\tab\\"q\\303\\251"'),
    't\tab"qé',
  );
});

check("apply_patch: add, update, delete, move, relative and absolute", () => {
  const patch = [
    "*** Begin Patch",
    "*** Add File: new.txt",
    "+x",
    "*** Update File: /abs/old.txt",
    "@@",
    "*** Delete File: sub/gone.txt",
    "*** Update File: from.txt",
    "*** Move to: to.txt",
    "*** End Patch",
  ].join("\n");
  assert.deepEqual(patchFiles(patch, "/w"), [
    { status: "A", path: "/w/new.txt" },
    { status: "M", path: "/abs/old.txt" },
    { status: "D", path: "/w/sub/gone.txt" },
    { status: "D", path: "/w/from.txt" },
    { status: "A", path: "/w/to.txt" },
  ]);
});

check("CRLF: originalFile gets the CRLF of the file, mixed gives none", () => {
  assert.equal(lineEndings("a\nb\n", "a\r\nB\r\n"), "a\r\nb\r\n");
  assert.equal(lineEndings("a\nb\n", "a\nB\n"), "a\nb\n");
  assert.equal(lineEndings("a\r\nb\r\n", "a\r\nB\r\n"), "a\r\nb\r\n");
  assert.equal(lineEndings("a\nb\n", "a\r\nB\n"), undefined);
});

/** A structuredPatch hunk as Claude Code gives it: tabs as two spaces. */
const hunk = (oldStart: number, newStart: number, lines: string[]): Hunk => ({
  oldStart,
  oldLines: lines.filter((line) => line[0] !== "+").length,
  newStart,
  newLines: lines.filter((line) => line[0] !== "-").length,
  lines: lines.map((line) => line.replace(/\t/g, "  ")),
});

check("rebuild: the occurrence in the hunk, not an equal one before it", () => {
  const before = "x = 1\na\nb\nc\nd\ne\nf\ng\nx = 1\n";
  const after = "x = 1\na\nb\nc\nd\ne\nf\ng\nx = 2\n";
  // newString "x = 2" is only at line 9, but "x = 1" twice in the before text.
  const patch = [hunk(6, 6, [" e", " f", " g", "-x = 1", "+x = 2"])];
  assert.equal(
    rebuildOriginal(after, { oldString: "x = 1", newString: "x = 2" }, patch),
    before,
  );
  // A newString that is also elsewhere in the file, far from the hunk.
  const twice = "y\n1\n2\n3\n4\n5\n6\ny\n";
  assert.equal(
    rebuildOriginal(twice, { oldString: "z", newString: "y" }, [
      hunk(5, 5, [" 4", " 5", " 6", "-z", "+y"]),
    ]),
    "y\n1\n2\n3\n4\n5\n6\nz\n",
  );
});

check("rebuild: a file with tabs, shown as two spaces in the patch", () => {
  const before = "\tif x:\n\t\treturn 1\n";
  const after = "\tif x:\n\t\treturn 2\n";
  const patch = [hunk(1, 1, [" \tif x:", "-\t\treturn 1", "+\t\treturn 2"])];
  assert.equal(
    rebuildOriginal(
      after,
      { oldString: "return 1", newString: "return 2" },
      patch,
    ),
    before,
  );
});

check("rebuild: an occurrence that reaches past its hunk", () => {
  // oldString and newString share 5 first lines, so the hunk starts later.
  const shared = "s1\ns2\ns3\ns4\ns5\n";
  const before = `top\n${shared}old\nend\n`;
  const after = `top\n${shared}new\nend\n`;
  const patch = [hunk(4, 4, [" s3", " s4", " s5", "-old", "+new", " end"])];
  assert.equal(
    rebuildOriginal(
      after,
      { oldString: `${shared}old`, newString: `${shared}new` },
      patch,
    ),
    before,
  );
});

check("rebuild: replaceAll, an empty newString, and no fit", () => {
  const before = "a\nk\nb\nc\nd\ne\nf\ng\nh\nk\n";
  const after = "a\nK\nb\nc\nd\ne\nf\ng\nh\nK\n";
  const patch = [
    hunk(1, 1, [" a", "-k", "+K", " b", " c", " d"]),
    hunk(7, 7, [" f", " g", " h", "-k", "+K"]),
  ];
  const all = { oldString: "k", newString: "K", replaceAll: true };
  assert.equal(rebuildOriginal(after, all, patch), before);
  const cut = rebuildOriginal("a\nc\n", { oldString: "b\n", newString: "" }, [
    hunk(1, 1, [" a", "-b", " c"]),
  ]);
  assert.equal(cut, "a\nb\nc\n");
  // The patch does not fit the edit: no text, not a wrong one.
  assert.equal(
    rebuildOriginal(after, { oldString: "q", newString: "K" }, patch),
    undefined,
  );
});

// ── Hook runs ─────────────────────────────────────────────────────────────────

const hook = path.join(import.meta.dirname, "..", "hook.ts");
const tmp = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "track-session-changes-")),
);
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
const home = path.join(tmp, "home");
const logOf = (session: string, agent = "claude") =>
  path.join(home, ".local/state/agent-changes", agent, `${session}.tsv`);
const stateOf = (session: string, agent = "claude") =>
  path.join(home, ".cache/track-session-changes", agent, session);

function sh(cwd: string, command: string) {
  execFileSync("bash", ["-c", command], { cwd, stdio: "ignore" });
}
function repo(name: string, files: Record<string, string>): string {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files))
    fs.writeFileSync(path.join(dir, file), text);
  sh(
    dir,
    "git init -q . && git add -A && git -c user.name=t -c user.email=t@t commit -q --no-verify --allow-empty -m init",
  );
  return dir;
}

function fire(payload: Record<string, unknown>, agent = "claude") {
  execFileSync("node", [hook, agent], {
    input: JSON.stringify(payload),
    env: { ...process.env, HOME: home },
  });
}
let calls = 0;
/** One Bash call: PreToolUse, the change, then the end event. */
function bash(
  cwd: string,
  change: () => void,
  opts: { session?: string; end?: string; agent?: string } = {},
) {
  const base = {
    session_id: opts.session ?? "s1",
    tool_use_id: `t${++calls}`,
    tool_name: "Bash",
    cwd,
  };
  fire({ ...base, hook_event_name: "PreToolUse" }, opts.agent);
  change();
  fire({ ...base, hook_event_name: opts.end ?? "PostToolUse" }, opts.agent);
}
/**
 * The log lines after the last `clear`. The log must stay, because the hook
 * reads the touched repos from it.
 */
const marks = new Map<string, number>();
function rows(session = "s1", agent = "claude"): string[] {
  if (!fs.existsSync(logOf(session, agent))) return [];
  const text = fs.readFileSync(logOf(session, agent), "utf8");
  return text
    .split("\n")
    .slice(0, -1)
    .slice(marks.get(logOf(session, agent)));
}
/** The log lines after the last `clear`, without the time and blob fields. */
const logged = (session = "s1", agent = "claude") =>
  rows(session, agent).map((line) => line.split("\t").slice(2, 7).join("\t"));
/** The before and after blob IDs of the log lines after the last `clear`. */
const blobs = (session = "s1", agent = "claude") =>
  rows(session, agent).map((line) => line.split("\t").slice(7));
const clear = (session = "s1") =>
  marks.set(
    logOf(session),
    (marks.get(logOf(session)) ?? 0) + rows(session).length,
  );
const lines = (n: number) =>
  Array.from({ length: n }, (_, i) => `l${i + 1}\n`).join("");

const r1 = repo("r1", { "tracked.txt": lines(10), "gone.txt": "b\n" });
const objectCount = () =>
  Number(
    execFileSync("bash", ["-c", "find .git/objects -type f | wc -l"], {
      cwd: r1,
    }),
  );
const repoObjects = objectCount();

check("Bash: add, modify with its line, delete", () => {
  bash(r1, () =>
    sh(r1, "perl -i -pe 's/^l7$/x/' tracked.txt; echo n >new.txt; rm gone.txt"),
  );
  const row = (status: string, file: string, line: string) =>
    `Bash\t${status}\t${r1}\t${r1}/${file}\t${line}`;
  assert.deepEqual(
    logged().sort(),
    [
      row("A", "new.txt", "1"),
      row("D", "gone.txt", ""),
      row("M", "tracked.txt", "7"),
    ].sort(),
  );
});

check("Bash: a second change to an already modified file", () => {
  clear();
  bash(r1, () => sh(r1, "perl -i -pe 's/^l2$/y/' tracked.txt"));
  assert.deepEqual(logged(), [`Bash\tM\t${r1}\t${r1}/tracked.txt\t2`]);
});

check("Bash: a pure deletion gives the line after it", () => {
  clear();
  bash(r1, () => sh(r1, "perl -i -ne 'print unless /^l4$/' tracked.txt"));
  assert.deepEqual(logged(), [`Bash\tM\t${r1}\t${r1}/tracked.txt\t4`]);
});

check("Bash: no change, no line", () => {
  clear();
  bash(r1, () => {});
  assert.deepEqual(logged(), []);
});

check("Bash: a failed call still counts", () => {
  bash(r1, () => sh(r1, "echo w >>new.txt"), { end: "PostToolUseFailure" });
  assert.deepEqual(logged(), [`Bash\tM\t${r1}\t${r1}/new.txt\t2`]);
});

check("the repo objects stay untouched, and no pending call is left", () => {
  assert.equal(objectCount(), repoObjects);
  assert.deepEqual(fs.readdirSync(path.join(stateOf("s1"), "pending")), []);
  assert.deepEqual(fs.readdirSync(path.join(stateOf("s1"), "calls")), []);
});

check("the log line has the call window in UTC with milliseconds", () => {
  const [start, end] = fs.readFileSync(logOf("s1"), "utf8").split("\t");
  assert.match(start, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.ok(start <= end);
});

check("parallel calls both log, and share one index", () => {
  clear();
  const base = { session_id: "s1", tool_name: "Bash", cwd: r1 };
  fire({ ...base, tool_use_id: "p1", hook_event_name: "PreToolUse" });
  fire({ ...base, tool_use_id: "p2", hook_event_name: "PreToolUse" });
  sh(r1, "echo q >>tracked.txt");
  fire({ ...base, tool_use_id: "p1", hook_event_name: "PostToolUse" });
  fire({ ...base, tool_use_id: "p2", hook_event_name: "PostToolUse" });
  assert.equal(logged().length, 2);
  assert.equal(fs.readdirSync(path.join(stateOf("s1"), "index")).length, 1);
});

check("overlapping calls: each logs the changes of its own window", () => {
  const base = { tool_name: "Bash", cwd: r1 };
  const ov = (session: string, id: string, event: string) =>
    fire({
      ...base,
      session_id: session,
      tool_use_id: id,
      hook_event_name: event,
    });
  ov("oa", "a1", "PreToolUse");
  sh(r1, "echo x >x.txt");
  ov("ob", "b1", "PreToolUse");
  sh(r1, "echo y >y.txt; echo a >>new.txt");
  ov("oa", "a1", "PostToolUse");
  ov("ob", "b1", "PostToolUse");
  const files = (session: string) =>
    logged(session)
      .map((line) => path.basename(line.split("\t")[3]))
      .sort();
  assert.deepEqual(files("oa"), ["new.txt", "x.txt", "y.txt"]);
  assert.deepEqual(files("ob"), ["new.txt", "y.txt"]);
});

check("a cached repo gives way to a repo made in a directory below it", () => {
  const sub = path.join(r1, "nested");
  fs.mkdirSync(sub);
  bash(sub, () => sh(sub, "echo 1 >one.txt"), { session: "s6" });
  sh(sub, "git init -q .");
  bash(sub, () => sh(sub, "echo 2 >two.txt"), { session: "s6" });
  assert.deepEqual(logged("s6"), [
    `Bash\tA\t${r1}\t${sub}/one.txt\t1`,
    `Bash\tA\t${sub}\t${sub}/two.txt\t1`,
  ]);
  fs.rmSync(sub, { recursive: true });
});

const r2 = repo("r2", { "a.txt": lines(5) });
const r3 = repo("r3", { "a.txt": lines(5) });

check("Edit: line from structuredPatch, start from duration_ms", () => {
  clear();
  sh(r2, "perl -i -pe 's/^l3$/THREE/' a.txt");
  const hunk = {
    oldStart: 1,
    oldLines: 5,
    newStart: 1,
    newLines: 5,
    lines: [" l1", " l2", "-l3", "+THREE", " l4", " l5"],
  };
  fire({
    session_id: "s1",
    tool_use_id: "e1",
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    cwd: r1,
    duration_ms: 1500,
    tool_input: { file_path: `${r2}/a.txt` },
    tool_response: { filePath: `${r2}/a.txt`, structuredPatch: [hunk] },
  });
  assert.deepEqual(logged(), [`Edit\tM\t${r2}\t${r2}/a.txt\t3`]);
  const [start, end] = rows()[0].split("\t");
  assert.equal(Date.parse(end) - Date.parse(start), 1500);
  // The next tool call in r2 finds the repo with no rev-parse.
  const cache = fs.readFileSync(path.join(stateOf("s1"), "repos.json"), "utf8");
  assert.equal(JSON.parse(cache)[r2]?.top, r2);
});

check("Bash: snapshots the repos the session changed, not other repos", () => {
  clear();
  bash(r1, () => sh(tmp, "echo z >>r2/a.txt; echo z >>r3/a.txt"));
  assert.deepEqual(logged(), [`Bash\tM\t${r2}\t${r2}/a.txt\t6`]);
});

check("Write: create outside a repo, and a failed Edit logs nothing", () => {
  clear();
  const file = path.join(tmp, "plain", "b.txt");
  const base = { session_id: "s1", hook_event_name: "PostToolUse", cwd: r1 };
  fire({
    ...base,
    tool_use_id: "w1",
    tool_name: "Write",
    tool_input: { file_path: file },
    tool_response: { type: "create", filePath: file, structuredPatch: [] },
  });
  fire({
    ...base,
    tool_use_id: "e2",
    tool_name: "Edit",
    tool_input: { file_path: file },
    tool_response: "Error: String to replace not found",
  });
  assert.deepEqual(logged(), [`Write\tA\t\t${file}\t1`]);
});

check("NotebookEdit: the first changed line of the file text", () => {
  clear();
  const file = `${r2}/n.ipynb`;
  // The payload shape of a probe on 2026-10-14. A failed call sends no event.
  const base = {
    session_id: "s1",
    hook_event_name: "PostToolUse",
    tool_name: "NotebookEdit",
    cwd: r1,
    tool_input: { notebook_path: file, cell_id: "c1", new_source: "x" },
  };
  fire({
    ...base,
    tool_use_id: "n1",
    tool_response: {
      error: "",
      notebook_path: file,
      original_file: '{\n "cells": [\n  "a"\n ]\n}\n',
      updated_file: '{\n "cells": [\n  "x"\n ]\n}\n',
    },
  });
  fire({
    ...base,
    tool_use_id: "n2",
    tool_response: { error: "Cell not found", notebook_path: file },
  });
  assert.deepEqual(logged(), [`NotebookEdit\tM\t${r2}\t${file}\t3`]);
});

check(
  "Codex apply_patch: files from the patch, lines from the snapshot",
  () => {
    const cx = repo("cx", { "u.txt": lines(6), "d.txt": "d\n" });
    const outside = path.join(tmp, "plain", "o.txt");
    const command = [
      "*** Begin Patch",
      "*** Update File: u.txt",
      "@@",
      "-l4",
      "+four",
      "*** Add File: sub/n.txt",
      "+n",
      "*** Delete File: d.txt",
      `*** Add File: ${outside}`,
      "+o",
      "*** End Patch",
    ].join("\n");
    const base = {
      session_id: "c1",
      tool_use_id: "call_1",
      tool_name: "apply_patch",
      cwd: cx,
      tool_input: { command },
    };
    fire({ ...base, hook_event_name: "PreToolUse" }, "codex");
    sh(
      cx,
      `perl -i -pe 's/^l4$/four/' u.txt; mkdir sub; echo n >sub/n.txt; rm d.txt; echo o >${outside}; echo s >stray.txt`,
    );
    fire({ ...base, hook_event_name: "PostToolUse" }, "codex");
    assert.deepEqual(logged("c1", "codex"), [
      `apply_patch\tM\t${cx}\t${cx}/u.txt\t4`,
      `apply_patch\tA\t${cx}\t${cx}/sub/n.txt\t1`,
      `apply_patch\tD\t${cx}\t${cx}/d.txt\t`,
      `apply_patch\tA\t\t${outside}\t1`,
    ]);
  },
);

check("a symlinked cwd keeps the link in the path", () => {
  clear();
  fs.symlinkSync(r1, path.join(tmp, "link"));
  bash(path.join(tmp, "link"), () => sh(r1, "echo s >>tracked.txt"), {
    session: "s2",
  });
  assert.deepEqual(logged("s2"), [
    `Bash\tM\t${tmp}/link\t${tmp}/link/tracked.txt\t11`,
  ]);
});

check("a repo with two names gets one snapshot", () => {
  // The log of s2 names the repo through the link, and cwd is the real path.
  bash(r1, () => sh(r1, "echo t >>tracked.txt"), { session: "s2" });
  assert.deepEqual(logged("s2").slice(1), [
    `Bash\tM\t${r1}\t${r1}/tracked.txt\t12`,
  ]);
});

check("a repo without commits", () => {
  const empty = path.join(tmp, "empty");
  fs.mkdirSync(empty);
  sh(empty, "git init -q .");
  bash(empty, () => sh(empty, "echo e >e.txt"), { session: "s3" });
  assert.deepEqual(logged("s3"), [`Bash\tA\t${empty}\t${empty}/e.txt\t1`]);
});

check("outside a repo, with no touched repo, no state and no log", () => {
  bash(path.join(tmp, "plain"), () => {}, { session: "s4" });
  assert.equal(fs.existsSync(stateOf("s4")), false);
  assert.equal(fs.existsSync(logOf("s4")), false);
});

check("a session id with a slash writes nothing", () => {
  bash(r1, () => sh(r1, "echo t >>tracked.txt"), { session: "../evil" });
  assert.equal(
    fs.existsSync(path.join(home, ".local/state/agent-changes/evil.tsv")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(home, ".cache/track-session-changes/evil")),
    false,
  );
});

// ── Blobs ─────────────────────────────────────────────────────────────────────

const objectsOf = (session: string, agent = "claude") =>
  path.join(home, ".local/state/agent-changes", agent, session, "objects");
/** The git blob ID of `text`. */
const blobId = (text: string) =>
  execFileSync("git", ["hash-object", "--stdin"], { input: text })
    .toString()
    .trim();
/** The text of blob `id`, from the objects of `session` and of `repo`. */
const blobText = (id: string, session: string, repo: string) =>
  execFileSync(
    "git",
    ["--git-dir", path.join(repo, ".git"), "cat-file", "-p", id],
    {
      env: {
        ...process.env,
        GIT_OBJECT_DIRECTORY: objectsOf(session),
        GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repo, ".git", "objects"),
      },
    },
  ).toString();

check("writeBlob: git reads the loose object, with the ID of git", () => {
  const dir = path.join(tmp, "loose");
  const id = writeBlob(dir, Buffer.from("loose\n"));
  assert.equal(id, blobId("loose\n"));
  assert.equal(writeBlob(dir, Buffer.from("loose\n")), id);
  const text = execFileSync("git", ["cat-file", "-p", id], {
    cwd: r1,
    env: { ...process.env, GIT_OBJECT_DIRECTORY: dir },
  }).toString();
  assert.equal(text, "loose\n");
});

check("Bash: the blobs before and after each file, readable", () => {
  const rb = repo("rb", { "m.txt": "one\n", "d.txt": "gone\n" });
  bash(rb, () => sh(rb, "echo two >m.txt; echo new >n.txt; rm d.txt"), {
    session: "b1",
  });
  const by = new Map(
    rows("b1").map((line) => {
      const fields = line.split("\t");
      return [path.basename(fields[5]), fields.slice(7)];
    }),
  );
  assert.deepEqual(by.get("m.txt"), [blobId("one\n"), blobId("two\n")]);
  assert.deepEqual(by.get("n.txt"), ["", blobId("new\n")]);
  assert.deepEqual(by.get("d.txt"), [blobId("gone\n"), ""]);
  // The before blob is in the repo, the after blob in the session objects.
  assert.equal(blobText(blobId("one\n"), "b1", rb), "one\n");
  assert.equal(blobText(blobId("two\n"), "b1", rb), "two\n");
  // A second call: its before blob is the after blob of the first.
  bash(rb, () => sh(rb, "echo three >m.txt"), { session: "b1" });
  assert.deepEqual(blobs("b1").at(-1), [blobId("two\n"), blobId("three\n")]);
});

const rt = repo("rt", { "e.txt": "a\nb\n" });
const edit = (
  session: string,
  file: string,
  response: Record<string, unknown>,
  tool = "Edit",
) =>
  fire({
    session_id: session,
    tool_use_id: `x${++calls}`,
    hook_event_name: "PostToolUse",
    tool_name: tool,
    cwd: rt,
    tool_input: { file_path: file },
    tool_response: { filePath: file, ...response },
  });

check("Edit: before from originalFile, after from the file on disk", () => {
  const file = path.join(rt, "e.txt");
  fs.writeFileSync(file, "a\nB\n");
  const patch = [hunk(1, 1, [" a", "-b", "+B"])];
  edit("b2", file, { originalFile: "a\nb\n", structuredPatch: patch });
  assert.deepEqual(blobs("b2"), [[blobId("a\nb\n"), blobId("a\nB\n")]]);
  assert.equal(blobText(blobId("a\nB\n"), "b2", rt), "a\nB\n");
});

check(
  "Edit: no originalFile, so a rebuild from oldString and newString",
  () => {
    const file = path.join(rt, "e.txt");
    fs.writeFileSync(file, "a\nC\n");
    const patch = [hunk(1, 1, [" a", "-B", "+C"])];
    edit("b3", file, {
      originalFile: null,
      oldString: "B",
      newString: "C",
      structuredPatch: patch,
    });
    assert.deepEqual(blobs("b3"), [[blobId("a\nB\n"), blobId("a\nC\n")]]);
  },
);

check(
  "Edit: CRLF on disk, LF in originalFile, and mixed gives no before",
  () => {
    const file = path.join(rt, "crlf.txt");
    fs.writeFileSync(file, "a\r\nB\r\n");
    const patch = [hunk(1, 1, [" a", "-b", "+B"])];
    edit("b4", file, { originalFile: "a\nb\n", structuredPatch: patch });
    fs.writeFileSync(file, "a\r\nB\n");
    edit("b4", file, { originalFile: "a\nb\n", structuredPatch: patch });
    assert.deepEqual(blobs("b4"), [
      [blobId("a\r\nb\r\n"), blobId("a\r\nB\r\n")],
      ["", blobId("a\r\nB\n")],
    ]);
  },
);

check("Write that creates, and NotebookEdit: their blobs", () => {
  const file = path.join(rt, "w.txt");
  fs.writeFileSync(file, "w\n");
  edit("b5", file, { type: "create", structuredPatch: [] }, "Write");
  const notebook = path.join(rt, "n.ipynb");
  fs.writeFileSync(notebook, '{"cells": ["x"]}\n');
  fire({
    session_id: "b5",
    tool_use_id: `x${++calls}`,
    hook_event_name: "PostToolUse",
    tool_name: "NotebookEdit",
    cwd: rt,
    tool_input: { notebook_path: notebook },
    tool_response: {
      error: "",
      original_file: '{"cells": ["a"]}\n',
      updated_file: '{\n "cells": ["x"]\n}\n',
    },
  });
  assert.deepEqual(blobs("b5"), [
    ["", blobId("w\n")],
    [blobId('{"cells": ["a"]}\n'), blobId('{"cells": ["x"]}\n')],
  ]);
});

check("a repo whose attributes convert CRLF: the blob of git", () => {
  const ra = repo("ra", { ".gitattributes": "*.txt text\n" });
  const file = path.join(ra, "c.txt");
  fs.writeFileSync(file, "a\r\n");
  fire({
    session_id: "b6",
    tool_use_id: `x${++calls}`,
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    cwd: ra,
    tool_input: { file_path: file },
    tool_response: { type: "create", filePath: file, structuredPatch: [] },
  });
  const id = execFileSync("git", ["hash-object", "c.txt"], { cwd: ra })
    .toString()
    .trim();
  assert.equal(id, blobId("a\n"));
  assert.deepEqual(blobs("b6"), [["", id]]);
  assert.equal(blobText(id, "b6", ra), "a\n");
});

check("apply_patch: the blobs of the snapshot for the named files", () => {
  const cy = repo("cy", { "u.txt": "u\n" });
  const command =
    "*** Begin Patch\n*** Update File: u.txt\n@@\n-u\n+U\n*** End Patch";
  const base = {
    session_id: "c2",
    tool_use_id: "call_2",
    tool_name: "apply_patch",
    cwd: cy,
    tool_input: { command },
  };
  fire({ ...base, hook_event_name: "PreToolUse" }, "codex");
  fs.writeFileSync(path.join(cy, "u.txt"), "U\n");
  fire({ ...base, hook_event_name: "PostToolUse" }, "codex");
  assert.deepEqual(blobs("c2", "codex"), [[blobId("u\n"), blobId("U\n")]]);
});

check("SessionStart prunes old logs, old state, and old pending calls", () => {
  const old = new Date(Date.now() - 31 * 24 * 3600 * 1000);
  const day = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  fs.mkdirSync(path.join(stateOf("old", "codex"), "pending"), {
    recursive: true,
  });
  fs.writeFileSync(logOf("old", "codex"), "x\n");
  fs.writeFileSync(path.join(stateOf("s1"), "pending", "stale"), "{}");
  for (const file of [
    logOf("old", "codex"),
    path.join(stateOf("old", "codex"), "pending"),
    stateOf("old", "codex"),
  ])
    fs.utimesSync(file, old, old);
  fs.utimesSync(path.join(stateOf("s1"), "pending", "stale"), day, day);
  fire({ session_id: "s5", hook_event_name: "SessionStart", cwd: r1 });
  assert.equal(fs.existsSync(logOf("old", "codex")), false);
  assert.equal(fs.existsSync(stateOf("old", "codex")), false);
  assert.equal(
    fs.existsSync(path.join(stateOf("s1"), "pending", "stale")),
    false,
  );
  assert.equal(fs.existsSync(logOf("s1")), true);
  assert.equal(fs.existsSync(path.join(stateOf("s1"), "index")), true);
});

check(
  "the prune deletes the objects of a session with no log and no state",
  () => {
    const container = path.join(
      home,
      ".local/state/agent-changes/containers/box/claude/k1/objects",
    );
    fs.mkdirSync(container, { recursive: true });
    fs.rmSync(logOf("b2"));
    fs.rmSync(logOf("b3"));
    fs.rmSync(stateOf("b3"), { recursive: true, force: true });
    fire({ session_id: "s5", hook_event_name: "SessionStart", cwd: r1 });
    // b2 keeps its state, so its objects stay.
    assert.equal(fs.existsSync(objectsOf("b2")), true);
    assert.equal(fs.existsSync(objectsOf("b3")), false);
    assert.equal(fs.existsSync(objectsOf("b1")), true);
    assert.equal(fs.existsSync(container), true);
  },
);

check("the prune deletes a call index by the time of its link", () => {
  const calls = path.join(stateOf("s1"), "calls");
  fs.writeFileSync(path.join(calls, "lost.0.index"), "");
  const home0 = process.env.HOME;
  process.env.HOME = home;
  try {
    prune(Date.now() + 12 * 3600 * 1000);
    assert.equal(fs.existsSync(path.join(calls, "lost.0.index")), true);
    prune(Date.now() + 2 * 24 * 3600 * 1000);
    assert.equal(fs.existsSync(path.join(calls, "lost.0.index")), false);
  } finally {
    process.env.HOME = home0;
  }
});

console.log(
  process.exitCode ? `${checks} checks, some failed` : `${checks} checks pass`,
);
