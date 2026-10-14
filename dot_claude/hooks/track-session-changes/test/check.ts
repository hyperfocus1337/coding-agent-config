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
  patchFiles,
  patchLine,
  prune,
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
/** The log lines after the last `clear`, without the two time fields. */
const logged = (session = "s1", agent = "claude") =>
  rows(session, agent).map((line) => line.split("\t").slice(2).join("\t"));
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
