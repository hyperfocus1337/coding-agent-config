/**
 * Records the files that an agent session changes, one log line per file per
 * tool call. The adapters pass in the file and process functions (`Io`):
 * hooks/register.ts (the Claude Code mod), pi.ts (pi and omp), and command.ts
 * (Codex). No Node import, so the mod can run it.
 *
 * Log: ~/.local/state/agent-changes/<agent>/<session id>.tsv, one line per file:
 * start, end, tool, status (A, M, D), repo, path, line, before, after. The
 * line is the first changed line after the call, empty for D or when it is not
 * known. Before and after are the git blob IDs of the file around the call.
 *
 * Objects: ~/.local/state/agent-changes/<agent>/<session id>/objects/, a git
 * object directory with the blobs of the snapshots and of each before and
 * after. It is beside the log, so a bind mount gives the host the blobs of a
 * container session too. It reads the repo objects as an alternate, so the
 * hook never writes to a repo.
 *
 * State: ~/.cache/track-session-changes/<agent>/<session id>/, with one git
 * index per repo, the repos found so far, a link to the index of each running
 * call, and for command.ts the pending calls.
 */

/** One changed file of one tool call. */
export interface Change {
  status: "A" | "M" | "D";
  /** Absolute path. */
  path: string;
  /** First changed line after the call. Undefined for D or when not known. */
  line?: number;
  /** The repo top. Undefined when not looked up yet, "" outside a repo. */
  repo?: string;
  /** Blob ID of the file before the call. Undefined for A or when not known. */
  before?: string;
  /** Blob ID of the file after the call. Undefined for D or when not known. */
  after?: string;
  /**
   * The text before the call, for a tool that names its file. `recordFiles`
   * stores it as the before blob.
   */
  old?: string;
}

/** A hunk of Claude Code `structuredPatch`, as in Edit and Write results. */
export interface Hunk {
  oldStart?: number;
  oldLines?: number;
  newStart: number;
  newLines?: number;
  lines: string[];
}

/**
 * The file and process functions of the core. Paths are absolute. A function
 * that fails returns undefined, false, or [] instead of throwing.
 */
export interface Io {
  /** The text of a file; undefined when it cannot be read. */
  read(path: string): Promise<string | undefined>;
  /** Writes a whole file, and makes its folders. */
  write(path: string, text: string): Promise<void>;
  /** Appends to a file, and makes its folders. */
  append(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** The last change of a file or folder in ms; undefined when missing. */
  mtime(path: string): Promise<number | undefined>;
  /** The names in a folder; [] when it is missing. */
  list(dir: string): Promise<string[]>;
  /** The path with every link resolved; undefined when missing. */
  realpath(path: string): Promise<string | undefined>;
  /** Makes a folder and its parents. */
  mkdir(path: string): Promise<void>;
  /** Copies a file, with its times: git trusts the stat data of the index. */
  copy(from: string, to: string): Promise<boolean>;
  /** Makes a hard link. */
  link(from: string, to: string): Promise<boolean>;
  rename(from: string, to: string): Promise<boolean>;
  /** Removes a file or a folder tree; nothing when missing. */
  remove(path: string): Promise<void>;
  /**
   * Runs a program with `env` over the environment of the agent and `stdin`
   * as its input. Drops stderr. `truncated` when the adapter kept only the
   * first part of stdout. Undefined when the program cannot start.
   */
  run(
    argv: string[],
    options?: { env?: Record<string, string>; stdin?: string },
  ): Promise<
    { exitCode: number; stdout: string; truncated: boolean } | undefined
  >;
}

/** The log of one session: the home folder, the agent, and the session id. */
export interface Where {
  home: string;
  agent: string;
  session: string;
}

const DAY = 24 * 60 * 60 * 1000;
/** A log or a state directory that was not written for this long is deleted. */
const KEEP = 30 * DAY;
/** A pending call this old lost its end event, for example a denied call. */
const KEEP_PENDING = DAY;

// ── Paths ─────────────────────────────────────────────────────────────────────

/** `path` with `.` and `..` folded, and no empty part. */
function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/"))
    if (part === "..") parts.pop();
    else if (part !== "" && part !== ".") parts.push(part);
  return `/${parts.join("/")}`;
}
/** `file` against the absolute folder `dir`, as `path.resolve` does. */
export const resolve = (dir: string, file: string) =>
  normalize(file.startsWith("/") ? file : `${dir}/${file}`);
const dirname = (path: string) =>
  path.slice(0, Math.max(path.lastIndexOf("/"), 0)) || "/";

const logRoot = (home: string) => `${home}/.local/state/agent-changes`;
const stateRoot = (home: string) => `${home}/.cache/track-session-changes`;

const logFile = ({ home, agent, session }: Where) =>
  `${logRoot(home)}/${agent}/${session}.tsv`;
const stateDir = ({ home, agent, session }: Where) =>
  `${stateRoot(home)}/${agent}/${session}`;
const objectsDir = ({ home, agent, session }: Where) =>
  `${logRoot(home)}/${agent}/${session}/objects`;

/** An agent, session, or call id becomes a file name, so it must not be a path. */
const safeName = (...names: string[]) =>
  names.every((name) => /^[\w.-]+$/.test(name) && !/^\.+$/.test(name));

/** The SHA-1 of the UTF-8 of `text`, in hex. */
async function sha1(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Makes `dir` unless it is there: a `$.fs.exists` costs less than a `mkdir`. */
async function ensureDir(io: Io, dir: string) {
  if (!(await io.exists(dir))) await io.mkdir(dir);
}

// ── Git ───────────────────────────────────────────────────────────────────────

/** The stdout of a git command in `top`; undefined when it fails. */
async function git(
  io: Io,
  top: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; truncated: boolean } | undefined> {
  const ran = await io.run(["git", "-C", top, ...args], { env });
  return ran?.exitCode === 0 ? ran : undefined;
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
async function repoAt(io: Io, dir: string): Promise<Repo | undefined> {
  while (!(await io.exists(dir)) && dirname(dir) !== dir) dir = dirname(dir);
  const out = await git(io, dir, [
    ...["rev-parse", "--show-cdup", "--path-format=absolute"],
    ...["--git-path", "objects", "--git-path", "index"],
  ]);
  const [cdup = "", objects, index] = out?.stdout.split("\n") ?? [];
  if (!objects || !index) return undefined;
  return { top: resolve(dir, cdup), objects, index };
}

/**
 * `repoAt` with a cache in `repos.json` of the session state, so a call starts
 * no `rev-parse` for a directory that an earlier call looked up. An entry
 * holds while `<top>/.git` exists and no directory between `dir` and the top
 * has a `.git`. A directory outside every repo is not cached, so a later
 * `git init` there counts. The result maps each of `dirs` to its repo,
 * undefined outside a repo.
 */
async function cachedRepos(
  io: Io,
  state: string,
  dirs: string[],
): Promise<Map<string, Repo | undefined>> {
  if (dirs.length === 0) return new Map();
  const file = `${state}/repos.json`;
  let cache: Record<string, Repo> = {};
  try {
    cache = JSON.parse((await io.read(file)) ?? "{}") as Record<string, Repo>;
  } catch {
    // A broken cache is rebuilt.
  }
  const holds = async (dir: string, { top }: Repo) => {
    if (!(await io.exists(`${top}/.git`))) return false;
    for (; dir !== top; dir = dirname(dir))
      if (dir === dirname(dir) || (await io.exists(`${dir}/.git`)))
        return false;
    return true;
  };
  let changed = false;
  const repos = new Map<string, Repo | undefined>();
  for (const dir of dirs) {
    if (repos.has(dir)) continue;
    const known = cache[dir];
    let repo = known && (await holds(dir, known)) ? known : undefined;
    if (!repo) {
      repo = await repoAt(io, dir);
      if (repo) [cache[dir], changed] = [repo, true];
    }
    repos.set(dir, repo);
  }
  if (changed) {
    const tmp = `${file}.${crypto.randomUUID()}`;
    await io.write(tmp, JSON.stringify(cache));
    if (!(await io.rename(tmp, file))) await io.remove(tmp);
  }
  return repos;
}

/**
 * The environment that points git at the session object directory. The repo
 * objects stay readable as an alternate, and new objects go to the session.
 * shortcut: `objects/` in the state directory is a second alternate, because
 * some session states hold blobs there. git only warns when it is missing.
 * The prune deletes the last of these directories by 2026-11-14; then remove
 * the second alternate.
 */
const objectEnv = (objects: string, state: string, repo: Repo) => ({
  GIT_OBJECT_DIRECTORY: objects,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: `${repo.objects}:${state}/objects`,
});

// ── Blobs ─────────────────────────────────────────────────────────────────────

/**
 * Writes blobs to the session objects with `git hash-object -w`, in one git
 * start, and returns their IDs: `old` (the text of `file` before a call) first,
 * then `file` on disk. In a repo, git applies the filters of the attributes
 * to both, as `git add` does. Outside a repo, git writes no object, so a bare
 * repo in the session state takes the write, with no filters. An ID is
 * undefined when git fails.
 */
async function storeBlobs(
  io: Io,
  where: Where,
  repo: Repo | undefined,
  file: string,
  { old, after }: { old?: string; after: boolean },
): Promise<{ before?: string; after?: string }> {
  if (old === undefined && !after) return {};
  const objects = objectsDir(where);
  const state = stateDir(where);
  await ensureDir(io, objects);
  let argv: string[];
  let env: Record<string, string>;
  if (repo) {
    argv = ["git", "-C", repo.top, "hash-object", "-w", `--path=${file}`];
    env = objectEnv(objects, state, repo);
  } else {
    const bare = `${state}/blobs.git`;
    if (!(await io.exists(bare)))
      await io.run(["git", "init", "-q", "--bare", "--template=", bare]);
    argv = ["git", `--git-dir=${bare}`, "hash-object", "-w", "--no-filters"];
    env = { GIT_OBJECT_DIRECTORY: objects };
  }
  if (old !== undefined) argv.push("--stdin");
  if (after) argv.push(file);
  const ran = await io.run(argv, { env, stdin: old ?? "" });
  if (ran?.exitCode !== 0) return {};
  const ids = ran.stdout.split("\n");
  return old === undefined
    ? { after: ids[0] }
    : { before: ids[0], after: after ? ids[1] : undefined };
}

/**
 * Writes the files of a repo on disk as blobs, in one git start, and maps each
 * path to its ID. git stops at a file that it cannot read, so the files after
 * it go in one more start. A path with a newline gets no ID.
 */
async function storeFiles(
  io: Io,
  where: Where,
  repo: Repo,
  files: string[],
): Promise<Map<string, string>> {
  const objects = objectsDir(where);
  const env = objectEnv(objects, stateDir(where), repo);
  await ensureDir(io, objects);
  const ids = new Map<string, string>();
  let rest = files.filter((file) => !file.includes("\n"));
  while (rest.length) {
    const ran = await io.run(
      ["git", "-C", repo.top, "hash-object", "-w", "--stdin-paths"],
      { env, stdin: rest.map((file) => `${file}\n`).join("") },
    );
    if (!ran) break;
    const found = ran.stdout.split("\n").filter(Boolean);
    found.forEach((id, i) => ids.set(rest[i] ?? "", id));
    if (ran.exitCode === 0) break;
    rest = rest.slice(found.length + 1);
  }
  return ids;
}

/**
 * Brings the session index of the repo up to date with the work tree, and
 * links it to `link`, the index of one call. Each session keeps one index per
 * repo, so `git add -A` hashes only the files whose stat changed since the
 * last call. It stores their blobs, so the end of the call can diff them.
 */
async function snapshot(
  io: Io,
  where: Where,
  repo: Repo,
  link: string,
): Promise<boolean> {
  const state = stateDir(where);
  const objects = objectsDir(where);
  const index = `${state}/index/${await sha1(repo.top)}`;
  await ensureDir(io, `${state}/index`);
  await ensureDir(io, objects);
  // Parallel calls share the index, so work on a copy and rename it back.
  const tmp = `${index}.${crypto.randomUUID()}`;
  let renamed = false;
  try {
    const from = (await io.exists(index)) ? index : repo.index;
    if ((await io.exists(from)) && !(await io.copy(from, tmp))) return false;
    const env = { ...objectEnv(objects, state, repo), GIT_INDEX_FILE: tmp };
    if (!(await git(io, repo.top, ["add", "-A"], env))) return false;
    // A repo with no file has no index, and git reads a missing link as empty.
    if (!(await io.exists(tmp))) return true;
    // git replaces the index file on each write, so the link keeps this one.
    await ensureDir(io, dirname(link));
    if (!(await io.link(tmp, link)) && !(await io.copy(tmp, link)))
      return false;
    renamed = await io.rename(tmp, index);
    return true;
  } finally {
    if (!renamed) await io.remove(tmp);
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
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  for (let i = 1; i < rest.length && rest[i] !== '"'; i++) {
    const next = rest[i + 1] ?? "";
    if (rest[i] !== "\\") {
      const char = String.fromCodePoint(rest.codePointAt(i) ?? 0);
      bytes.push(...encoder.encode(char));
      i += char.length - 1;
    } else if (/[0-7]/.test(next)) {
      bytes.push(parseInt(rest.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      i++;
      bytes.push(escapes[next] ?? next.charCodeAt(0));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).slice(2);
}

/** The first changed line of a `-U0` hunk. A pure deletion (`+c,0`) sits after line c. */
export function hunkLine(header: string): number | undefined {
  const match = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(header);
  if (!match) return undefined;
  return Number(match[1]) + (match[2] === "0" ? 1 : 0);
}

/**
 * The files that differ between the index of a call and the work tree, with
 * the first changed line and the blobs of each. `git status` gives the paths
 * and the before blobs in one process, one `hash-object` writes the after
 * blobs, and a patch runs only when a tracked file changed.
 */
async function diffCall(
  io: Io,
  where: Where,
  repo: Repo,
  link: string,
): Promise<Change[]> {
  const { top } = repo;
  const env = {
    ...objectEnv(objectsDir(where), stateDir(where), repo),
    GIT_INDEX_FILE: link,
  };
  const status = await git(
    io,
    top,
    [
      ...["--no-optional-locks", "status", "--porcelain=v2", "-z"],
      ...["--untracked-files=all", "--no-renames", "--ignore-submodules=dirty"],
    ],
    env,
  );
  if (!status) return [];
  const entries = status.stdout.split("\0");
  // The last entry of a cut output can be cut too.
  if (status.truncated) entries.pop();
  const changes: Change[] = [];
  const add = (status: Change["status"], file: string, before?: string) =>
    changes.push({
      status,
      path: resolve(top, file),
      line: status === "A" ? 1 : undefined,
      repo: top,
      before: before && !/^0+$/.test(before) ? before : undefined,
    });
  for (const entry of entries) {
    // `1 XY sub mH mI mW hH hI path`: Y is the work tree against the index,
    // and hI the blob of the file in the index of the call.
    // T, a type change such as a file that became a symlink, counts as M.
    // A nested repo shows as an untracked directory, `? dir/`, and is left out.
    const fields = entry.split(" ");
    const xy = fields[1] ?? "";
    if (entry.startsWith("1 ") && xy[1] !== ".")
      add(xy[1] === "D" ? "D" : "M", fields.slice(8).join(" "), fields[7]);
    else if (entry.startsWith("? ") && !entry.endsWith("/"))
      add("A", entry.slice(2));
  }
  const ids = await storeFiles(
    io,
    where,
    repo,
    changes.filter((change) => change.status !== "D").map(({ path }) => path),
  );
  for (const change of changes) change.after = ids.get(change.path);
  if (!changes.some((change) => change.status === "M")) return changes;
  // The patch only adds the lines. When it fails or is cut, the paths still count.
  const patch = await git(
    io,
    top,
    [
      ...["-c", "core.quotePath=false", "diff-files", "--no-ext-diff"],
      ...["--no-textconv", "--ignore-submodules=dirty", "--diff-filter=MT"],
      ...["--src-prefix=a/", "--dst-prefix=b/", "-p", "-U0"],
    ],
    env,
  );
  if (!patch || patch.truncated) return changes;
  const lines = new Map<string, number | undefined>();
  let file: string | undefined;
  for (const text of patch.stdout.split("\n")) {
    if (text.startsWith("diff --git ")) file = resolve(top, headerPath(text));
    else if (file !== undefined && text.startsWith("@@ ") && !lines.has(file))
      lines.set(file, hunkLine(text));
  }
  for (const change of changes)
    if (change.status === "M") change.line = lines.get(change.path);
  return changes;
}

// ── Log ───────────────────────────────────────────────────────────────────────

/** Appends one line per change to the session log, in one write. */
async function append(
  io: Io,
  where: Where,
  tool: string,
  start: Date,
  end: Date,
  changes: Change[],
) {
  if (changes.length === 0) return;
  const repos = await cachedRepos(
    io,
    stateDir(where),
    changes
      .filter((change) => change.repo === undefined)
      .map((change) => dirname(change.path)),
  );
  const text = changes.map((change) => {
    const fields = [
      start.toISOString(),
      end.toISOString(),
      tool,
      change.status,
      change.repo ?? repos.get(dirname(change.path))?.top ?? "",
      change.path,
      change.line ?? "",
      change.before ?? "",
      change.after ?? "",
    ];
    return `${fields.join("\t")}\n`;
  });
  await io.append(logFile(where), text.join(""));
}

/** The repos that the session log names: the repos the session changed so far. */
async function touchedRepos(io: Io, where: Where): Promise<string[]> {
  const text = (await io.read(logFile(where))) ?? "";
  return [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.split("\t")[4] ?? "")
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

/**
 * The before text of a Claude Code Edit or Write, with the line endings of the
 * file on disk. `originalFile` has LF line endings, but the tool keeps the
 * CRLF endings of the file. So when each line of `after` ends in CRLF, each LF
 * of `original` becomes CRLF. Undefined for a file with mixed line endings.
 */
export function lineEndings(
  original: string,
  after: string,
): string | undefined {
  if (!after.includes("\r\n") || original.includes("\r")) return original;
  const lines = after.split("\n").slice(0, -1);
  if (!lines.every((line) => line.endsWith("\r"))) return undefined;
  return original.replace(/\n/g, "\r\n");
}

/** The edit of a Claude Code Edit result. */
export interface Edit {
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
}

/**
 * Checks that the old side of each hunk is in `text`. `structuredPatch` shows a
 * tab as two spaces, so the check does too.
 */
function hunksFit(text: string, hunks: Hunk[]): boolean {
  const lines = text.split("\n");
  const norm = (line: string) => line.replace(/\t/g, "  ");
  return hunks.every((hunk) => {
    if (hunk.oldStart === undefined) return false;
    const old = hunk.lines
      .filter((line) => line[0] === " " || line[0] === "-")
      .map((line) => line.slice(1));
    const first = Math.max(hunk.oldStart - 1, 0);
    return old.every((line, i) => norm(lines[first + i] ?? "") === norm(line));
  });
}

/**
 * The text of a file before a Claude Code Edit, rebuilt from the text after
 * it, for a result without `originalFile`. Undoing the hunks alone is wrong,
 * because `structuredPatch` shows a tab as two spaces. So it puts `oldString`
 * back in place of `newString` at an occurrence that overlaps a hunk, or at
 * each such occurrence with `replaceAll`, and checks the old side of each hunk.
 * An occurrence can reach past its hunk, which holds only the changed lines
 * and 3 context lines. Undefined when no occurrence passes, so the rebuild
 * never gives a wrong text.
 */
export function rebuildOriginal(
  after: string,
  edit: Edit,
  hunks: Hunk[],
): string | undefined {
  const { oldString, newString, replaceAll } = edit;
  if (oldString === undefined || newString === undefined || !hunks.length)
    return undefined;
  const starts = [0];
  for (let i = after.indexOf("\n"); i !== -1; i = after.indexOf("\n", i + 1))
    starts.push(i + 1);
  const lineOf = (offset: number) => {
    let [low, high] = [0, starts.length - 1];
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] ?? 0) <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
  const ranges = hunks.map((hunk) => {
    const count =
      hunk.newLines ?? hunk.lines.filter((line) => line[0] !== "-").length;
    return [hunk.newStart, hunk.newStart + Math.max(count, 1) - 1] as const;
  });
  const overlaps = (from: number, to: number) =>
    ranges.some(([first, last]) => lineOf(from) <= last && lineOf(to) >= first);
  const spots: number[] = [];
  if (newString === "") {
    // A deletion leaves no text to find, so each offset of a hunk is a spot.
    if (replaceAll) return undefined;
    for (const [first, last] of ranges)
      for (
        let i = starts[first - 1] ?? after.length;
        i <= (starts[last] ?? after.length);
        i++
      )
        spots.push(i);
  } else
    for (
      let i = after.indexOf(newString);
      i !== -1;
      i = after.indexOf(newString, i + newString.length)
    )
      if (overlaps(i, i + newString.length - 1)) spots.push(i);
  const build = (at: number[]) => {
    let [text, last] = ["", 0];
    for (const i of at) {
      text += after.slice(last, i) + oldString;
      last = i + newString.length;
    }
    return text + after.slice(last);
  };
  if (replaceAll) {
    const text = build(spots);
    return spots.length && hunksFit(text, hunks) ? text : undefined;
  }
  // Each try copies the file, so a large file with many spots gives up.
  if (spots.length * after.length > 64 * 1024 * 1024) return undefined;
  for (const i of spots) {
    const text = build([i]);
    if (hunksFit(text, hunks)) return text;
  }
  return undefined;
}

/**
 * Logs the files that a tool named in its input. Such a tool needs no
 * snapshot. The file on disk is the after blob of a change, and its `old` text
 * the before blob.
 */
export async function recordFiles(
  io: Io,
  where: Where,
  tool: string,
  start: Date,
  end: Date,
  changes: Change[],
) {
  if (!safeName(where.agent, where.session)) return;
  const repos = await cachedRepos(
    io,
    stateDir(where),
    changes.map((change) => dirname(change.path)),
  );
  for (const change of changes) {
    const repo = repos.get(dirname(change.path));
    change.repo ??= repo?.top ?? "";
    const blobs = await storeBlobs(io, where, repo, change.path, {
      old:
        change.status === "A" || change.before !== undefined
          ? undefined
          : change.old,
      after: change.status !== "D" && change.after === undefined,
    });
    change.after ??= blobs.after;
    change.before ??= blobs.before;
  }
  await append(io, where, tool, start, end, changes);
}

/** The result of a Claude Code Edit, Write, or NotebookEdit. */
export interface ToolResult extends Edit {
  type?: string;
  filePath?: string;
  structuredPatch?: Hunk[];
  originalFile?: string | null;
  error?: string;
  original_file?: string;
  updated_file?: string;
}

/**
 * Logs a Claude Code Edit, Write, or NotebookEdit from its result. `file` is
 * the path of the input, against `cwd`; the call ran from `start` to `end`.
 */
export async function recordTool(
  io: Io,
  where: Where,
  tool: string,
  file: string | undefined,
  result: ToolResult | undefined,
  cwd: string,
  start: Date,
  end: Date,
) {
  // A NotebookEdit result holds the file text before and after the call. The
  // after blob comes from the file on disk, because `updated_file` can format
  // the JSON in another way.
  if (tool === "NotebookEdit") {
    if (!file || !result || result.error || result.original_file === undefined)
      return;
    const line = changedLine(
      result.original_file ?? "",
      result.updated_file ?? "",
    );
    const path = resolve(cwd, file);
    return recordFiles(io, where, tool, start, end, [
      { status: "M", path, line, old: result.original_file },
    ]);
  }

  // A successful Edit or Write returns structuredPatch. A failed one returns an error string.
  file ??= result?.filePath;
  if (
    (tool !== "Edit" && tool !== "Write") ||
    !file ||
    !result?.structuredPatch
  )
    return;
  const status = result.type === "create" ? "A" : "M";
  const path = resolve(cwd, file);
  // The text before the call: `originalFile`, else a rebuild of the Edit.
  const after = status === "M" ? await io.read(path) : undefined;
  let old: string | undefined;
  if (after !== undefined) {
    const original =
      result.originalFile ??
      (tool === "Edit"
        ? rebuildOriginal(
            after.replace(/\r\n/g, "\n"),
            result,
            result.structuredPatch,
          )
        : undefined);
    if (original !== undefined) old = lineEndings(original, after);
  }
  await recordFiles(io, where, tool, start, end, [
    { status, path, line: patchLine(result.structuredPatch), old },
  ]);
}

// ── Tools without a path: Bash and apply_patch ────────────────────────────────

/** The snapshots of a running call: its start, and the index link of each repo. */
export interface Pending {
  start: string;
  repos: (Repo & { link: string })[];
}

/**
 * Snapshots the repos that a call can change, before it runs: the repo of
 * `cwd`, the repos of `paths`, and the repos the session changed so far. The
 * adapter keeps the result until the end of the call. A link name holds its
 * time, which the prune reads.
 */
export async function beginCall(
  io: Io,
  where: Where,
  cwd: string,
  paths: string[] = [],
): Promise<Pending | undefined> {
  if (!safeName(where.agent, where.session)) return undefined;
  const state = stateDir(where);
  const dirs = [cwd, ...paths.map(dirname)];
  const repos = new Map<string, Repo>();
  for (const repo of (
    await cachedRepos(io, state, [...dirs, ...(await touchedRepos(io, where))])
  ).values()) {
    if (!repo) continue;
    // One repo can have two names, such as /tmp and /private/tmp on macOS.
    const real = (await io.realpath(repo.top)) ?? repo.top;
    if (!repos.has(real)) repos.set(real, repo);
  }
  const pending: Pending = { start: new Date().toISOString(), repos: [] };
  const id = crypto.randomUUID();
  for (const repo of repos.values()) {
    const n = pending.repos.length;
    const link = `${state}/calls/${id}.${n}.${Date.now()}.index`;
    if (await snapshot(io, where, repo, link))
      pending.repos.push({ ...repo, link });
  }
  return pending.repos.length ? pending : undefined;
}

/** Removes the index links of a call that did not run, such as a denied call. */
export async function dropCall(io: Io, pending: Pending | undefined) {
  for (const { link } of pending?.repos ?? []) await io.remove(link);
}

/**
 * Compares the work tree with the index of each repo from `beginCall` and logs
 * the difference. With `named`, the call named its files (apply_patch): only
 * those are logged, and the snapshot gives their lines and blobs. A named file
 * outside the snapshot repos gets line 1 for A and no line for M, and no
 * before blob.
 */
export async function endCall(
  io: Io,
  where: Where,
  pending: Pending | undefined,
  tool: string,
  named?: Change[],
) {
  if (!safeName(where.agent, where.session)) return;
  const end = new Date();
  const start = pending ? new Date(pending.start) : end;
  const changes: Change[] = [];
  for (const { link, ...repo } of pending?.repos ?? []) {
    changes.push(...(await diffCall(io, where, repo, link)));
    await io.remove(link);
  }
  if (!named) return append(io, where, tool, start, end, changes);
  const found = new Map(changes.map((change) => [change.path, change]));
  for (const change of named) {
    const snap = found.get(change.path);
    change.before ??= snap?.before;
    if (change.status === "D") continue;
    change.line ??= snap?.line ?? (change.status === "A" ? 1 : undefined);
    change.after ??= snap?.after;
    change.after ??= (
      await storeBlobs(io, where, undefined, change.path, { after: true })
    ).after;
  }
  await append(io, where, tool, start, end, named);
}

/**
 * The file that holds a pending call between two runs of command.ts.
 * Undefined for an id that is not a safe file name.
 */
export const pendingFile = (where: Where, callId: string) =>
  safeName(where.agent, where.session, callId)
    ? `${stateDir(where)}/pending/${callId}`
    : undefined;

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
  for (const [, verb = "", file = ""] of patch.matchAll(
    /^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/gm,
  )) {
    const last = changes.at(-1);
    if (verb === "Move to" && last) last.status = "D";
    changes.push({
      status: statuses[verb] ?? "M",
      path: resolve(cwd, file.trim()),
    });
  }
  return changes;
}

// ── Prune ─────────────────────────────────────────────────────────────────────

/**
 * Deletes the logs and the session state of all agents that were not written
 * for 30 days, and pending calls older than one day. The objects of a session
 * go when both its log and its state are gone. A snapshot renames a file
 * in index/, and command.ts adds and removes one in pending/, so the newest
 * mtime of the session directory and these two is its last use. The index of
 * a call in calls/ is a link that keeps the mtime of the index, so its age is
 * the time in its name. A link with no time in its name is from before the
 * mod, and goes at once.
 */
export async function prune(io: Io, home: string, now = Date.now()) {
  const logs = logRoot(home);
  const states = stateRoot(home);
  const age = async (path: string) => now - ((await io.mtime(path)) ?? 0);
  for (const agent of await io.list(logs))
    for (const name of await io.list(`${logs}/${agent}`)) {
      const log = `${logs}/${agent}/${name}`;
      if (name.endsWith(".tsv") && (await age(log)) > KEEP)
        await io.remove(log);
    }
  for (const agent of await io.list(states))
    for (const name of await io.list(`${states}/${agent}`)) {
      const session = `${states}/${agent}/${name}`;
      const ages = [
        await age(session),
        await age(`${session}/index`),
        await age(`${session}/pending`),
      ];
      if (Math.min(...ages) > KEEP) {
        await io.remove(session);
        continue;
      }
      for (const call of await io.list(`${session}/pending`))
        if ((await age(`${session}/pending/${call}`)) > KEEP_PENDING)
          await io.remove(`${session}/pending/${call}`);
      for (const call of await io.list(`${session}/calls`)) {
        const made = Number(/\.(\d+)\.index$/.exec(call)?.[1] ?? 0);
        if (now - made > KEEP_PENDING)
          await io.remove(`${session}/calls/${call}`);
      }
    }
  // containers/ holds the logs of each container, which its own prune keeps.
  for (const agent of await io.list(logs))
    if (agent !== "containers")
      for (const session of await io.list(`${logs}/${agent}`)) {
        const dir = `${logs}/${agent}/${session}`;
        if (
          (await io.exists(`${dir}/objects`)) &&
          !(await io.exists(`${dir}.tsv`)) &&
          !(await io.exists(stateDir({ home, agent, session })))
        )
          await io.remove(dir);
      }
}
