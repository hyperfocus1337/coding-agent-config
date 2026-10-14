/**
 * Records the files that an agent session changes, one log line per file per
 * tool call. The command hook (`hook.ts`) calls it for Claude Code and Codex,
 * and the pi extension imports it in-process for pi and omp. No dependency and
 * no agent import.
 *
 * Log: ~/.local/state/agent-changes/<agent>/<session id>.tsv, one line per file:
 * start, end, tool, status (A, M, D), repo, path, line. The line is the first
 * changed line after the call, empty for D or when it is not known.
 *
 * State: ~/.cache/track-session-changes/<agent>/<session id>/, with one git
 * index per repo, the repos found so far, the pending calls with a link to the
 * index of each call, and an object directory with the blobs of the snapshots.
 * It reads the repo objects as an alternate, so the hook never writes to a
 * repo.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** One changed file of one tool call. */
export interface Change {
  status: "A" | "M" | "D";
  /** Absolute path. */
  path: string;
  /** First changed line after the call. Undefined for D or when not known. */
  line?: number;
  /** The repo top. Undefined when not looked up yet, "" outside a repo. */
  repo?: string;
}

/** A hunk of Claude Code `structuredPatch`, as in Edit and Write results. */
export interface Hunk {
  newStart: number;
  lines: string[];
}

const DAY = 24 * 60 * 60 * 1000;
/** A log or a state directory that was not written for this long is deleted. */
const KEEP = 30 * DAY;
/** A pending call this old lost its end event, for example a denied call. */
const KEEP_PENDING = DAY;
/** The patch output of a call with many changed files can be large. */
const MAX_PATCH = 64 * 1024 * 1024;

// ── Paths ─────────────────────────────────────────────────────────────────────

const logRoot = () => path.join(os.homedir(), ".local/state/agent-changes");
const stateRoot = () => path.join(os.homedir(), ".cache/track-session-changes");

export const logFile = (agent: string, session: string) =>
  path.join(logRoot(), agent, `${session}.tsv`);
const stateDir = (agent: string, session: string) =>
  path.join(stateRoot(), agent, session);

/** An agent, session, or call id becomes a file name, so it must not be a path. */
const safeName = (...names: string[]) =>
  names.every((name) => /^[\w.-]+$/.test(name) && !/^\.+$/.test(name));

// ── Git ───────────────────────────────────────────────────────────────────────

function git(
  top: string,
  args: string[],
  env: Record<string, string> = {},
  input?: string,
  maxBuffer?: number,
): string | undefined {
  const run = spawnSync("git", ["-C", top, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
    maxBuffer,
    stdio: ["pipe", "pipe", "ignore"],
  });
  return run.status === 0 ? run.stdout : undefined;
}

/** A git work tree, with the object directory and the index of the repo. */
interface Repo {
  top: string;
  objects: string;
  index: string;
}

/**
 * The repo that holds `dir`, in one git process. A missing `dir` counts from
 * its nearest parent that exists. The top keeps symlinks: `--show-toplevel`
 * would resolve them, and then a Bash path would not match the tool path of
 * the same file.
 */
function repoAt(dir: string): Repo | undefined {
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir)
    dir = path.dirname(dir);
  const out = git(dir, [
    ...["rev-parse", "--show-cdup", "--path-format=absolute"],
    ...["--git-path", "objects", "--git-path", "index"],
  ]);
  const [cdup, objects, index] = out?.split("\n") ?? [];
  if (!objects || !index) return undefined;
  return { top: path.resolve(dir, cdup), objects, index };
}

/** The top of the work tree that holds `dir`, or "" outside a repo. */
export const repoOf = (dir: string) => repoAt(dir)?.top ?? "";

/**
 * `repoAt` with a cache in `repos.json` of the session state, so a call starts
 * no `rev-parse` for a directory that an earlier call looked up. An entry
 * holds while `<top>/.git` exists and no directory between `dir` and the top
 * has a `.git`. A directory outside every repo is not cached, so a later
 * `git init` there counts.
 */
function cachedRepos(state: string, dirs: string[]): Map<string, Repo> {
  const file = path.join(state, "repos.json");
  let cache: Record<string, Repo> = {};
  try {
    cache = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Repo>;
  } catch {
    // No cache yet.
  }
  const holds = (dir: string, { top }: Repo) => {
    if (!fs.existsSync(path.join(top, ".git"))) return false;
    for (; dir !== top; dir = path.dirname(dir))
      if (dir === path.dirname(dir) || fs.existsSync(path.join(dir, ".git")))
        return false;
    return true;
  };
  let changed = false;
  const repos = new Map<string, Repo>();
  for (const dir of dirs) {
    let repo = cache[dir] && holds(dir, cache[dir]) ? cache[dir] : undefined;
    if (!repo) {
      repo = repoAt(dir);
      if (repo) [cache[dir], changed] = [repo, true];
    }
    if (repo && !repos.has(repo.top)) repos.set(repo.top, repo);
  }
  if (changed) {
    fs.mkdirSync(state, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, file);
  }
  return repos;
}

/**
 * The environment that points git at the session object directory. The repo
 * objects stay readable as an alternate, and new objects go to the session.
 */
const objectEnv = (state: string, repo: Repo) => ({
  GIT_OBJECT_DIRECTORY: path.join(state, "objects"),
  GIT_ALTERNATE_OBJECT_DIRECTORIES: repo.objects,
});

/**
 * Brings the session index of the repo up to date with the work tree, and
 * links it to `link`, the index of one call. Each session keeps one index per
 * repo, so `git add -A` hashes only the files whose stat changed since the
 * last call. It stores their blobs, so the end of the call can diff them.
 */
function snapshot(state: string, repo: Repo, link: string): boolean {
  const index = path.join(
    state,
    "index",
    createHash("sha1").update(repo.top).digest("hex"),
  );
  const env = objectEnv(state, repo);
  fs.mkdirSync(path.dirname(index), { recursive: true });
  fs.mkdirSync(env.GIT_OBJECT_DIRECTORY, { recursive: true });
  // Parallel calls share the index, so work on a copy and rename it back.
  const tmp = `${index}.${process.pid}.${Date.now()}`;
  try {
    const from = fs.existsSync(index) ? index : repo.index;
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, tmp);
      // git trusts the stat data of an entry older than the index file, so
      // the copy keeps the time of the original.
      const { atime, mtime } = fs.statSync(from);
      fs.utimesSync(tmp, atime, mtime);
    }
    const indexEnv = { ...env, GIT_INDEX_FILE: tmp };
    if (git(repo.top, ["add", "-A"], indexEnv) === undefined) return false;
    // A repo with no file has no index, and git reads a missing link as empty.
    if (!fs.existsSync(tmp)) return true;
    // git replaces the index file on each write, so the link keeps this one.
    fs.mkdirSync(path.dirname(link), { recursive: true });
    try {
      fs.linkSync(tmp, link);
    } catch {
      fs.copyFileSync(tmp, link);
      const { atime, mtime } = fs.statSync(tmp);
      fs.utimesSync(link, atime, mtime);
    }
    fs.renameSync(tmp, index);
    return true;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Reads the path of a `diff --git a/P b/P` header. Renames are off, so both sides match. */
export function headerPath(header: string): string {
  const rest = header.slice("diff --git ".length);
  if (!rest.startsWith('"')) return rest.slice(2, 2 + (rest.length - 5) / 2);
  // git C-quotes a path with a control character, a quote, or a backslash.
  const escapes: Record<string, number> = {
    a: 7,
    b: 8,
    t: 9,
    n: 10,
    v: 11,
    f: 12,
    r: 13,
  };
  const bytes: number[] = [];
  for (let i = 1; i < rest.length && rest[i] !== '"'; i++) {
    if (rest[i] !== "\\") {
      bytes.push(...Buffer.from(rest[i]));
    } else if (/[0-7]/.test(rest[i + 1])) {
      bytes.push(parseInt(rest.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      i++;
      bytes.push(escapes[rest[i]] ?? rest.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString("utf8").slice(2);
}

/** The first changed line of a `-U0` hunk. A pure deletion (`+c,0`) sits after line c. */
export function hunkLine(header: string): number | undefined {
  const match = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(header);
  if (!match) return undefined;
  return Number(match[1]) + (match[2] === "0" ? 1 : 0);
}

/**
 * The files that differ between the index of a call and the work tree, with
 * the first changed line of each. `git status` gives the paths in one
 * process, and a patch runs only when a tracked file changed.
 */
function diffCall(state: string, repo: Repo, link: string): Change[] {
  const { top } = repo;
  const env = { ...objectEnv(state, repo), GIT_INDEX_FILE: link };
  const status = git(
    top,
    [
      ...["--no-optional-locks", "status", "--porcelain=v2", "-z"],
      ...["--untracked-files=all", "--no-renames", "--ignore-submodules=dirty"],
    ],
    env,
  );
  if (!status) return [];
  const changes: Change[] = [];
  for (const entry of status.split("\0")) {
    // `1 XY sub mH mI mW hH hI path`: Y is the work tree against the index.
    // T, a type change such as a file that became a symlink, counts as M.
    // A nested repo shows as an untracked directory, `? dir/`, and is left out.
    const fields = entry.split(" ");
    const add = (status: Change["status"], file: string) =>
      changes.push({
        status,
        path: path.join(top, file),
        line: status === "A" ? 1 : undefined,
        repo: top,
      });
    if (entry.startsWith("1 ") && fields[1][1] !== ".")
      add(fields[1][1] === "D" ? "D" : "M", fields.slice(8).join(" "));
    else if (entry.startsWith("? ") && !entry.endsWith("/"))
      add("A", entry.slice(2));
  }
  if (!changes.some((change) => change.status === "M")) return changes;
  // The patch only adds the lines. When it fails or is too large, the paths still count.
  const patch = git(
    top,
    [
      ...["-c", "core.quotePath=false", "diff-files", "--no-ext-diff"],
      ...["--no-textconv", "--ignore-submodules=dirty", "--diff-filter=MT"],
      ...["--src-prefix=a/", "--dst-prefix=b/", "-p", "-U0"],
    ],
    env,
    undefined,
    MAX_PATCH,
  );
  const lines = new Map<string, number | undefined>();
  let file: string | undefined;
  for (const text of patch?.split("\n") ?? []) {
    if (text.startsWith("diff --git ")) file = path.join(top, headerPath(text));
    else if (file !== undefined && text.startsWith("@@ ") && !lines.has(file))
      lines.set(file, hunkLine(text));
  }
  for (const change of changes)
    if (change.status === "M") change.line = lines.get(change.path);
  return changes;
}

// ── Log ───────────────────────────────────────────────────────────────────────

/** Appends one line per change to the session log, in one write. */
function append(
  agent: string,
  session: string,
  tool: string,
  start: Date,
  end: Date,
  changes: Change[],
) {
  if (changes.length === 0) return;
  const repos = new Map<string, string>();
  const text = changes.map((change) => {
    const dir = path.dirname(change.path);
    if (change.repo === undefined && !repos.has(dir))
      repos.set(dir, repoOf(dir));
    const repo = change.repo ?? repos.get(dir);
    const fields = [
      start.toISOString(),
      end.toISOString(),
      tool,
      change.status,
      repo,
      change.path,
      change.line ?? "",
    ];
    return `${fields.join("\t")}\n`;
  });
  const log = logFile(agent, session);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, text.join(""));
}

/** The repos that the session log names: the repos the session changed so far. */
function touchedRepos(agent: string, session: string): string[] {
  let text: string;
  try {
    text = fs.readFileSync(logFile(agent, session), "utf8");
  } catch {
    return [];
  }
  return [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.split("\t")[4])
        .filter(Boolean),
    ),
  ];
}

// ── Tools with a path in the input ────────────────────────────────────────────

/**
 * The first changed line of a Claude Code Edit or Write result: the new start
 * of the first hunk plus the context lines before the first + or - line. A
 * Write that creates a file has no hunks, so it gives line 1.
 */
export function patchLine(hunks: Hunk[] | undefined): number {
  const hunk = hunks?.[0];
  if (!hunk) return 1;
  const context = hunk.lines.findIndex(
    (line) => line.startsWith("+") || line.startsWith("-"),
  );
  return hunk.newStart + Math.max(context, 0);
}

/**
 * The first line that differs between two texts, for a pi or omp write. Lines
 * removed at the end give the line after the last one that is left, as a pure
 * deletion in `hunkLine`. Undefined when the texts are equal.
 */
export function changedLine(before: string, after: string): number | undefined {
  if (before === after) return undefined;
  const old = before.split("\n");
  const now = after.split("\n");
  let line = 0;
  while (line < old.length && line < now.length && old[line] === now[line])
    line++;
  return line + 1;
}

/** Logs the files that a tool named in its input. Such a tool needs no snapshot. */
export function recordFiles(
  agent: string,
  session: string,
  tool: string,
  start: Date,
  end: Date,
  changes: Change[],
) {
  if (safeName(agent, session))
    append(agent, session, tool, start, end, changes);
}

// ── Tools without a path: Bash and apply_patch ────────────────────────────────

interface Pending {
  start: string;
  repos: (Repo & { link: string })[];
}

/**
 * Snapshots the repos that a call can change, before it runs: the repo of
 * `cwd`, the repos of `paths`, and the repos the session changed so far.
 */
export function beginCall(
  agent: string,
  session: string,
  callId: string,
  cwd: string,
  paths: string[] = [],
) {
  if (!safeName(agent, session, callId)) return;
  const state = stateDir(agent, session);
  const dirs = [cwd, ...paths.map((file) => path.dirname(file))];
  const repos = cachedRepos(state, [...dirs, ...touchedRepos(agent, session)]);
  const pending: Pending = { start: new Date().toISOString(), repos: [] };
  for (const repo of repos.values()) {
    const link = path.join(
      state,
      "calls",
      `${callId}.${pending.repos.length}.index`,
    );
    if (snapshot(state, repo, link)) pending.repos.push({ ...repo, link });
  }
  if (pending.repos.length === 0) return;
  fs.mkdirSync(path.join(state, "pending"), { recursive: true });
  fs.writeFileSync(
    path.join(state, "pending", callId),
    JSON.stringify(pending),
  );
}

/**
 * Compares the work tree with the index of each repo from `beginCall` and logs
 * the difference. With `named`, the call named its files (apply_patch): only
 * those are logged, and the snapshot gives their lines. A named file outside
 * the snapshot repos gets line 1 for A and no line for M.
 */
export function endCall(
  agent: string,
  session: string,
  callId: string,
  tool: string,
  named?: Change[],
) {
  if (!safeName(agent, session, callId)) return;
  const state = stateDir(agent, session);
  const file = path.join(state, "pending", callId);
  let pending: Pending | undefined;
  try {
    pending = JSON.parse(fs.readFileSync(file, "utf8")) as Pending;
    fs.rmSync(file, { force: true });
  } catch {
    pending = undefined;
  }
  const end = new Date();
  const start = pending ? new Date(pending.start) : end;
  const changes: Change[] = [];
  for (const { link, ...repo } of pending?.repos ?? []) {
    // A pending call of the version before `link` has no index to compare.
    if (!link) continue;
    changes.push(...diffCall(state, repo, link));
    fs.rmSync(link, { force: true });
  }
  if (!named) return append(agent, session, tool, start, end, changes);
  const found = new Map(changes.map((change) => [change.path, change]));
  for (const change of named) {
    if (change.status === "D") continue;
    change.line ??=
      found.get(change.path)?.line ?? (change.status === "A" ? 1 : undefined);
  }
  append(agent, session, tool, start, end, named);
}

/**
 * The files of a Codex apply_patch call. Relative paths resolve against `cwd`.
 * A move logs the old path as D and the new path as A.
 */
export function patchFiles(patch: string, cwd: string): Change[] {
  const statuses: Record<string, Change["status"]> = {
    "Add File": "A",
    "Update File": "M",
    "Delete File": "D",
    "Move to": "A",
  };
  const changes: Change[] = [];
  for (const [, verb, file] of patch.matchAll(
    /^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/gm,
  )) {
    const status = statuses[verb];
    if (verb === "Move to" && changes.length)
      changes[changes.length - 1].status = "D";
    changes.push({ status, path: path.resolve(cwd, file.trim()) });
  }
  return changes;
}

// ── Prune ─────────────────────────────────────────────────────────────────────

const mtime = (file: string, kind: "mtimeMs" | "ctimeMs" = "mtimeMs") => {
  try {
    return fs.statSync(file)[kind];
  } catch {
    return 0;
  }
};
const entries = (dir: string) => {
  try {
    return fs.readdirSync(dir).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
};

/**
 * Deletes the logs and the session state of all agents that were not written
 * for 30 days, and pending calls older than one day. A snapshot renames a file
 * in index/, and a call adds and removes one in pending/, so the newest mtime
 * of the session directory and these two is its last use. The index of a call
 * in calls/ is a link that keeps the mtime of the index, so its age is the
 * ctime, which the link sets.
 */
export function prune(now = Date.now()) {
  for (const agent of entries(logRoot()))
    for (const log of entries(agent))
      if (log.endsWith(".tsv") && now - mtime(log) > KEEP)
        fs.rmSync(log, { force: true });
  for (const agent of entries(stateRoot()))
    for (const session of entries(agent)) {
      const used = Math.max(
        ...["", "index", "pending"].map((sub) =>
          mtime(path.join(session, sub)),
        ),
      );
      if (now - used > KEEP)
        fs.rmSync(session, { recursive: true, force: true });
      else
        for (const [sub, kind] of [
          ["pending", "mtimeMs"],
          ["calls", "ctimeMs"],
        ] as const)
          for (const call of entries(path.join(session, sub)))
            if (now - mtime(call, kind) > KEEP_PENDING)
              fs.rmSync(call, { force: true });
    }
}
