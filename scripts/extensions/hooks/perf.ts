/**
 * Times the TypeScript hooks in dot_claude/hooks: replays the tool calls of
 * the Claude Code transcripts (~/.claude/projects/*\/*.jsonl) through the
 * core.ts of each hook in this process, and through its command.ts with the
 * payload on stdin. Writes the results to ~/.cache/hook-perf/results.json,
 * and with --write DIR, summary.csv, slowest.csv, and README.md in DIR/data.
 * Without --write, prints summary.csv.
 *
 * The transcripts are only a source of input. Each session is rebuilt in a
 * fixture under ~/.cache/hook-perf/, and each path in a payload or a command
 * points into it. No historical command runs: it is only the payload. The
 * durationMs values and the hook output in the transcripts are not read.
 *
 * Run: node scripts/extensions/hooks/perf.ts [--write DIR] [--hook NAME]...
 * [--limit N] [--render], or `just hooks-perf`. --limit caps the calls of
 * each hook, for a smoke test. --render replays nothing: it writes the
 * report again from results.json.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const REPO = join(import.meta.dirname, "../../..");
const output = (argv: string[]) =>
  spawnSync(argv[0]!, argv.slice(1), {
    cwd: REPO,
    encoding: "utf8",
  }).stdout.trim();
const HEAD = output(["git", "rev-parse", "HEAD"]);
const PROJECTS = join(homedir(), ".claude/projects");
/** Not /tmp or $TMPDIR: the formatters skip files under those. */
const BASE = join(homedir(), ".cache/hook-perf");
/**
 * dot_claude/hooks at HEAD, from `git archive`, so an uncommitted edit of
 * another session does not reach the numbers.
 */
const HOOKS = join(BASE, "src", HEAD, "dot_claude/hooks");
/** TMPDIR of each hook. A throwaway path of a transcript maps under it. */
const SCRATCH = join(BASE, "tmp");
/** The lint-code config with the names that chezmoi gives it. */
const LINT_CONFIG = join(BASE, "lint-code-config");
const SEED = 20261020;
const BASH_SAMPLE = 2000;
const WARMUP = 20;
const DAY = 24 * 60 * 60 * 1000;

const { values: flags } = parseArgs({
  options: {
    write: { type: "string" },
    hook: { type: "string", multiple: true },
    limit: { type: "string" },
    render: { type: "boolean" },
  },
});
const LIMIT = flags.limit ? Number(flags.limit) : Infinity;

// ── Transcripts ───────────────────────────────────────────────────────────────

type Tool = "Write" | "Edit" | "NotebookEdit" | "Bash" | "Read";
type Event = Exclude<Tool, "Read"> | "Stop" | "SessionStart";
type Phase = "pre" | "post";

/** A file that a call leaves on disk, as the transcript tells it. */
interface Put {
  path: string;
  /** undefined: only the mtime changes. */
  text?: string;
}

/** The file of a Write or Edit after the call, for the slowest cases. */
interface File {
  path: string;
  text: string;
  /** Rebuilt from the patch hunks only: the text before was not known. */
  partial: boolean;
}

interface Call {
  key: string;
  tool: Tool;
  id: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  isError: boolean;
  cwd: string;
  time: number;
  turn: number;
  /** Filled by `plan`. */
  puts: Put[];
  file?: File;
  /** How `plan` found the text before an Edit. */
  edit?: "originalFile" | "state" | "hunks";
  commits: boolean;
}

interface Session {
  index: number;
  cwd: string;
  /** The transcript names a git branch, so the cwd was in a repo. */
  git: boolean;
  calls: Call[];
  /** The text of each file before its first call in the session. */
  initial: Map<string, string>;
  /** Index of the last call of each turn that changed files -> its files. */
  stops: Map<number, File[]>;
}

const TOOLS = new Set(["Write", "Edit", "NotebookEdit", "Bash", "Read"]);

/** The tool calls of one transcript that got a result, in order. */
function parseSession(file: string, index: number): Session {
  const session: Session = {
    index,
    cwd: "",
    git: false,
    calls: [],
    initial: new Map(),
    stops: new Map(),
  };
  const open = new Map<string, Call>();
  let turn = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.cwd && !session.cwd) session.cwd = entry.cwd;
    if (entry.gitBranch) session.git = true;
    const content = entry.message?.content;
    if (entry.type === "assistant" && Array.isArray(content)) {
      for (const block of content)
        if (block.type === "tool_use" && TOOLS.has(block.name))
          open.set(block.id, {
            key: `${index}/${block.id}`,
            tool: block.name,
            id: block.id,
            input: block.input ?? {},
            isError: false,
            cwd: entry.cwd || session.cwd,
            time: Date.parse(entry.timestamp),
            turn,
            puts: [],
            commits: false,
          });
    } else if (entry.type === "user") {
      const results = Array.isArray(content)
        ? content.filter((block) => block.type === "tool_result")
        : [];
      // A prompt starts a turn; a meta entry or a compact summary does not.
      if (!results.length) {
        if (!entry.isMeta && !entry.isCompactSummary) turn++;
        continue;
      }
      for (const block of results) {
        const call = open.get(block.tool_use_id);
        if (!call) continue;
        open.delete(block.tool_use_id);
        if (typeof entry.toolUseResult === "object" && entry.toolUseResult)
          call.result = entry.toolUseResult;
        call.isError = block.is_error === true;
        session.calls.push(call);
      }
    }
  }
  plan(session);
  return session;
}

/** The lines of one side of patch hunks: " " and "-" (old) or "+" (new). */
const side = (hunks: unknown, mark: "-" | "+") =>
  (Array.isArray(hunks) ? hunks : [])
    .flatMap((hunk) => hunk.lines as string[])
    .filter((row) => row[0] === " " || row[0] === mark)
    .map((row) => `${row.slice(1)}\n`)
    .join("");

/** `text` with the hunks applied by line number, last hunk first. */
function patch(text: string, hunks: unknown): string {
  const lines = text.split("\n");
  const list = (Array.isArray(hunks) ? [...hunks] : []).sort(
    (a, b) => b.oldStart - a.oldStart,
  );
  for (const hunk of list) {
    const rows = (hunk.lines as string[])
      .filter((row) => row[0] === " " || row[0] === "+")
      .map((row) => row.slice(1));
    lines.splice(Math.max(hunk.oldStart - 1, 0), hunk.oldLines, ...rows);
  }
  return lines.join("\n");
}

/** The commit test of block-secret-commits. */
const isCommit = (command: string) =>
  command.includes("git") && /(^|\s)commit([^A-Za-z0-9_-]|$)/.test(command);

/**
 * Follows the text of each file through the session, from the transcript
 * alone: the content of a Write, the originalFile of an Edit, a full Read,
 * and the hunks of an Edit or of a Bash call (bashEditDiff). An Edit with no
 * known text before it is rebuilt from its hunks only.
 */
function plan(session: Session) {
  const known = new Map<string, string>();
  const touched = new Set<string>();
  const first = (path: string, before: string | undefined) => {
    if (touched.has(path)) return;
    touched.add(path);
    if (before !== undefined) session.initial.set(path, before);
  };
  const changed = new Set<number>();
  for (const call of session.calls) {
    const { input, result } = call;
    const put = (path: string, text: string, partial = false) => {
      known.set(path, text);
      call.puts.push({ path, text });
      call.file = { path, text, partial };
      changed.add(call.turn);
    };
    const path = (input.file_path ?? input.notebook_path) as unknown;
    // A failed Write or Edit leaves the file as it was.
    if (
      (call.tool === "Write" || call.tool === "Edit") &&
      typeof path === "string" &&
      (call.isError || !result)
    ) {
      const text = known.get(path);
      if (text !== undefined) call.file = { path, text, partial: false };
      continue;
    }
    if (call.tool === "Read") {
      const file = result?.file as Record<string, unknown> | undefined;
      if (
        result?.type !== "text" ||
        typeof file?.content !== "string" ||
        typeof file.filePath !== "string" ||
        file.startLine !== 1 ||
        (file.numLines as number) < (file.totalLines as number) ||
        file.truncatedByTokenCap
      )
        continue;
      if (!touched.has(file.filePath)) first(file.filePath, file.content);
      else if (known.get(file.filePath) !== file.content)
        call.puts.push({ path: file.filePath, text: file.content });
      known.set(file.filePath, file.content);
    } else if (call.tool === "Write" && typeof path === "string" && result) {
      const before =
        typeof result.originalFile === "string"
          ? result.originalFile
          : known.get(path);
      first(path, result.type === "create" ? undefined : before);
      put(path, String(input.content ?? result.content ?? ""));
    } else if (call.tool === "Edit" && typeof path === "string" && result) {
      let before =
        typeof result.originalFile === "string"
          ? result.originalFile
          : known.get(path);
      call.edit =
        typeof result.originalFile === "string"
          ? "originalFile"
          : before === undefined
            ? "hunks"
            : "state";
      let after: string;
      if (before === undefined) {
        before = side(result.structuredPatch, "-");
        after = side(result.structuredPatch, "+");
      } else {
        const old = String(result.oldString ?? input.old_string ?? "");
        const neu = String(result.newString ?? input.new_string ?? "");
        if (old && before.includes(old))
          after =
            (result.replaceAll ?? input.replace_all)
              ? before.split(old).join(neu)
              : before.replace(old, () => neu);
        else after = patch(before, result.structuredPatch);
      }
      first(path, before);
      put(path, after, call.edit === "hunks");
    } else if (call.tool === "NotebookEdit" && typeof path === "string") {
      if (call.isError || typeof result?.updated_file !== "string") continue;
      first(path, result.original_file as string | undefined);
      put(path, result.updated_file);
    } else if (call.tool === "Bash") {
      call.commits = !call.isError && isCommit(String(input.command ?? ""));
      const diff = result?.bashEditDiff as
        | { changedFiles?: string[]; files?: Record<string, unknown>[] }
        | undefined;
      const named = new Set<string>();
      for (const file of diff?.files ?? []) {
        const name = file.filePath;
        if (typeof name !== "string") continue;
        named.add(name);
        const before = known.get(name);
        if (file.created) {
          first(name, undefined);
          put(name, side(file.hunks, "+"));
        } else if (before !== undefined) put(name, patch(before, file.hunks));
        else {
          first(name, side(file.hunks, "-"));
          put(name, side(file.hunks, "+"), true);
        }
      }
      for (const name of diff?.changedFiles ?? [])
        if (!named.has(name) && known.has(name)) {
          call.puts.push({ path: name });
          changed.add(call.turn);
        }
      // The slowest cases describe a Bash call by its command.
      call.file = undefined;
    }
  }
  // A Stop fires after the last call of a turn. Its files are the last text
  // of each file that a Write, an Edit, or a Bash call of the turn left.
  const last = new Map<number, number>();
  session.calls.forEach((call, i) => last.set(call.turn, i));
  for (const [turn, i] of last) {
    if (!changed.has(turn)) continue;
    const files = new Map<string, File>();
    for (const call of session.calls)
      if (call.turn !== turn) continue;
      else if (call.file) files.set(call.file.path, call.file);
      else
        for (const { path, text } of call.puts)
          if (text !== undefined)
            files.set(path, { path, text, partial: false });
    session.stops.set(i, [...files.values()]);
  }
}

// ── Fixture ───────────────────────────────────────────────────────────────────

/** A path that every hook skips. It maps under SCRATCH, the hooks' TMPDIR. */
const THROWAWAY = /^\/(private\/)?(tmp|var\/tmp|var\/folders)(\/|$)/;
const inside = (path: string) => path === BASE || path.startsWith(`${BASE}/`);

/** git for the fixture: no global hooks, no signing. */
function git(cwd: string, ...args: string[]) {
  spawnSync(
    "git",
    [
      "-c",
      "user.name=hook-perf",
      "-c",
      "user.email=hook-perf@localhost",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "hook.claude-format-staged.enabled=false",
      ...args,
    ],
    { cwd, stdio: "ignore" },
  );
}

/** The fixture of one session, for one hook and one path. */
class World {
  readonly root: string;
  readonly home: string;
  readonly scratch: string;
  repo?: string;
  /** The pending snapshot of a Bash call, for track-session-changes. */
  pending: unknown;
  /** Each file -> the original time of its last write; 0 before the session. */
  readonly written = new Map<string, number>();

  readonly session: Session;
  readonly dir: string;

  constructor(session: Session, dir: string, tag: string) {
    this.session = session;
    this.dir = dir;
    this.root = join(dir, "root");
    this.home = join(dir, "home");
    this.scratch = join(SCRATCH, tag);
  }

  /** An absolute path of the transcript, in the fixture. `..` stays inside. */
  map(path: string): string {
    const clean = posix.resolve("/", path);
    return (THROWAWAY.test(clean) ? this.scratch : this.root) + clean;
  }

  /**
   * The command with each absolute path that starts a word moved into the
   * fixture. The prefix goes in front, so a quoted path with spaces moves
   * whole. `//` (a URL) stays.
   */
  command(text: string): string {
    return text.replace(
      /(^|[\s'"=:(<>|;&`,@])(\/(?!\/)[^\s'"`;|&()<>,:]*)/g,
      (_, before: string, path: string) => before + this.map(path),
    );
  }

  /** Writes the files before the session, all old, and commits the repo. */
  setup(state: boolean) {
    rmSync(this.dir, { recursive: true, force: true });
    rmSync(this.scratch, { recursive: true, force: true });
    for (const dir of [this.root, this.home, this.scratch])
      mkdirSync(dir, { recursive: true });
    mkdirSync(this.map(this.session.cwd), { recursive: true });
    if (!state) return;
    const old = new Date(Date.now() - DAY);
    for (const [path, text] of this.session.initial) {
      const target = this.map(path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
      utimesSync(target, old, old);
      this.written.set(path, 0);
    }
    if (this.session.git) {
      this.repo = this.map(this.session.cwd);
      git(this.repo, "init", "-q");
      this.commit("base");
    }
  }

  cwd(call: Call): string {
    const dir = this.map(call.cwd);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Leaves the files of the call on disk. */
  apply(call: Call) {
    for (const { path, text } of call.puts) {
      const target = this.map(path);
      if (text !== undefined) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, text);
      } else if (existsSync(target)) {
        const now = new Date();
        utimesSync(target, now, now);
      }
      this.written.set(path, call.time);
    }
  }

  stage() {
    if (this.repo) git(this.repo, "add", "-A");
  }

  commit(message = "replay") {
    if (!this.repo) return;
    git(this.repo, "add", "-A");
    git(
      this.repo,
      "commit",
      "-q",
      "--allow-empty",
      "--no-verify",
      "-m",
      message,
    );
  }

  /**
   * Gives each file the age it had at `time` in the session, for the hooks
   * that take a Bash path only when its mtime is at most 120 s old.
   */
  age(time: number) {
    const now = Date.now();
    for (const [path, at] of this.written) {
      const target = this.map(path);
      const when = new Date(at ? now - Math.max(time - at, 0) : now - DAY);
      try {
        utimesSync(target, when, when);
      } catch {
        // A file that a call named but that is not in the fixture.
      }
    }
  }

  /** The content hash of the fixture files: a formatter changed one. */
  hash(): string {
    const sum = createHash("sha1");
    const files = readdirSync(this.root, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((e) => e.isFile() && !`${e.parentPath}/`.includes("/.git/"))
      .map((e) => join(e.parentPath, e.name))
      .sort();
    for (const file of files) sum.update(file).update(readFileSync(file));
    return sum.digest("hex");
  }

  /** The size of the track-session-changes log of the session. */
  log(session: string): number {
    const file = `${this.home}/.local/state/agent-changes/claude/${session}.tsv`;
    return existsSync(file) ? statSync(file).size : 0;
  }

  remove() {
    rmSync(this.dir, { recursive: true, force: true });
    rmSync(this.scratch, { recursive: true, force: true });
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** The programs a hook started in process, and a refused write. */
interface Trace {
  runs: { program: string; ok: boolean; exitCode?: number; ms: number }[];
  refused: boolean;
}

/** The programs that write the files they name. ruff only as `ruff format`. */
const WRITERS = new Set(["prettier", "emacs", "terraform", "shfmt"]);
/** The Io functions that change the disk. */
const MUTATORS = new Set([
  "write",
  "append",
  "copy",
  "link",
  "rename",
  "remove",
  "mkdir",
]);

/**
 * The Io of a hook with each program start recorded. A write outside BASE is
 * refused, and the call then counts as unsafe: a relative path with `..`, or
 * a path that does not start a word, can still name a real file.
 */
function watch<T extends object>(io: T, trace: Trace): T {
  return new Proxy(io, {
    get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        if (name === "run") {
          const argv = args[0] as string[];
          const options = args[1] as
            { env?: Record<string, string> } | undefined;
          const program = argv[0] ?? "";
          const files = [
            ...argv.slice(1),
            ...(options?.env?.ORG_TABLE_FILES?.split("\n") ?? []),
          ];
          if (
            (WRITERS.has(program) ||
              (program === "ruff" && argv[1] === "format")) &&
            files.some((file) => file.startsWith("/") && !inside(file))
          ) {
            trace.refused = true;
            return undefined;
          }
          const start = performance.now();
          const ran = await value.apply(target, args);
          trace.runs.push({
            program,
            ok: ran !== undefined,
            exitCode: ran?.exitCode,
            ms: performance.now() - start,
          });
          return ran;
        }
        if (
          MUTATORS.has(String(name)) &&
          args.some(
            (a) => typeof a === "string" && a.startsWith("/") && !inside(a),
          )
        ) {
          trace.refused = true;
          return undefined;
        }
        return value.apply(target, args);
      };
    },
  });
}

interface Ctx {
  world: World;
  /** undefined for Stop and SessionStart. */
  call?: Call;
  event: Event;
  session: string;
  cwd: string;
  filePath?: string;
  command?: string;
  result?: Record<string, unknown>;
  trace: Trace;
}

// The hook modules have no shared type, so they load as `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Modules = Record<string, any>;

interface Hook {
  name: string;
  /** The events, with the phases of each: before and after the tool. */
  on: Partial<Record<Event, Phase[]>>;
  /** The programs that count as the tool of the hook. */
  tools: string[];
  /** Reads files or git: the fixture follows the session. */
  state?: boolean;
  /** Takes a Bash path by its mtime: the files get their age in the session. */
  mtime?: boolean;
  /** The adapters skip a failed Write or Edit before the core. */
  skipFailed?: boolean;
  /** How the work shows: a changed fixture file, or a longer log. Else the exit code. */
  probe?: "files" | "log";
  /** The command.ts arguments; undefined when there is no command.ts. */
  args?: string[];
  /** Why the hook is not measured. */
  none?: string;
  /** What "did work" means, for the report. */
  work: string;
  core(
    c: Ctx,
    phase: Phase,
    m: Modules,
  ): Promise<{ acted?: boolean; off?: boolean }>;
}

/** The call of a formatter or of lint-code: a file, or a command. */
const toolCall = (c: Ctx) =>
  c.call?.tool === "Bash"
    ? { command: c.command, cwd: c.cwd }
    : { filePath: c.filePath, cwd: c.cwd };

const formatter = (name: string, fn: string, tools: string[]): Hook => ({
  name,
  on: { Write: ["post"], Edit: ["post"], Bash: ["post"] },
  tools,
  state: true,
  mtime: !tools.includes("prettier"),
  probe: "files",
  args: [],
  work: `${tools.join(" or ")} changed a file`,
  core: async (c, _phase, m) => {
    // nodeIo is an object in some hooks and a function in others.
    const io = typeof m.io.nodeIo === "function" ? m.io.nodeIo() : m.io.nodeIo;
    await m.core[fn](toolCall(c), watch(io, c.trace), m.io.nodeSettings());
    return {};
  },
});

const typeCheck = (name: string, tool: string): Hook => ({
  name,
  on: { Stop: ["post"] },
  tools: [tool],
  state: true,
  args: [],
  work: "blocked the stop with errors",
  core: async (c, _phase, m) => {
    const io = watch(m.io.nodeIo(), c.trace);
    return {
      acted: (await m.core.check(c.cwd, io, m.io.nodeSettings())) !== undefined,
    };
  },
});

const HOOK_LIST: Hook[] = [
  formatter("format-prettier", "format", ["prettier"]),
  formatter("format-org-tables", "align", ["emacs"]),
  formatter("format-code", "format", ["terraform", "shfmt", "ruff"]),
  {
    name: "lint-code",
    on: { Write: ["post"], Edit: ["post"], Bash: ["post"] },
    tools: [
      "ruff",
      "oxlint",
      "shellcheck",
      "yamllint",
      "ansible-lint",
      "tflint",
    ],
    state: true,
    mtime: true,
    args: [],
    work: "reported lint errors",
    core: async (c, _phase, m) => {
      const io = watch(m.io.nodeIo(c.cwd), c.trace);
      const settings = { ...m.io.nodeSettings(), configDir: LINT_CONFIG };
      const files = await m.core.targets(toolCall(c), io, settings);
      return { acted: (await m.core.lint(files, io, settings)) !== undefined };
    },
  },
  {
    name: "lint-prose",
    on: { Write: ["post"], Edit: ["post"] },
    tools: ["bash"],
    state: true,
    skipFailed: true,
    args: [],
    work: "blocked on alerts or gave a notice",
    core: async (c, _phase, m) => {
      const io = watch(m.io.nodeIo(), c.trace);
      const { block, notice } = await m.core.check(
        c.filePath,
        c.session,
        io,
        m.io.nodeSettings(),
      );
      // A Vale that cannot start or fails `--version` turns the hook off.
      const vale = c.trace.runs.find((run) => run.program === "vale");
      return {
        acted: Boolean(block || notice),
        off: vale && vale.exitCode !== 0,
      };
    },
  },
  {
    name: "block-secret-commits",
    on: { Bash: ["pre"] },
    tools: ["betterleaks"],
    state: true,
    args: [],
    work: "blocked the commit",
    core: async (c, _phase, m) => {
      const io = watch(m.io.nodeIo(c.cwd), c.trace);
      const verdict = await m.core.check(
        c.command,
        io,
        m.io.nodeSettings(c.cwd),
      );
      return { acted: verdict.block !== undefined };
    },
  },
  {
    name: "enforce-cli-tools",
    on: { Bash: ["pre"] },
    tools: [],
    args: [],
    work: "blocked the call",
    core: async (c, _phase, m) => {
      const { rules, allowed } = m.io.inputs(c.cwd);
      const rule = m.core.violation(c.command, rules, allowed);
      if (rule) m.core.blockMessage(c.command, rule, c.cwd);
      return { acted: rule !== undefined };
    },
  },
  {
    name: "block-commit-attribution",
    on: { Bash: ["pre"] },
    tools: [],
    work: "blocked the commit",
    core: async (c, _phase, m) => ({
      acted: m.core.violation(c.command) !== undefined,
    }),
  },
  {
    name: "track-session-changes",
    on: {
      Write: ["post"],
      Edit: ["post"],
      NotebookEdit: ["post"],
      Bash: ["pre", "post"],
      SessionStart: ["post"],
    },
    tools: ["git"],
    state: true,
    skipFailed: true,
    probe: "log",
    args: ["claude"],
    work: "logged a changed file",
    core: async (c, phase, m) => {
      const io = watch(m.io.nodeIo(), c.trace);
      const where = { home: c.world.home, agent: "claude", session: c.session };
      if (!c.call) await m.core.prune(io, where.home);
      else if (c.call.tool === "Bash" && phase === "pre")
        c.world.pending = await m.core.beginCall(io, where, c.cwd);
      else if (c.call.tool === "Bash")
        await m.core.endCall(io, where, c.world.pending, "Bash");
      else {
        const end = new Date();
        await m.core.recordTool(
          io,
          where,
          c.call.tool,
          c.filePath,
          c.result,
          c.cwd,
          new Date(end.getTime() - 1),
          end,
        );
      }
      return {};
    },
  },
  typeCheck("type-check-tsc", "tsc"),
  typeCheck("type-check-pyrefly", "pyrefly"),
  {
    name: "toggle-hook",
    on: {},
    tools: [],
    none: "no tool event: it only adds the /toggle-hook command",
    work: "",
    core: async () => ({}),
  },
];

const load = async (hook: Hook): Promise<Modules> => {
  const dir = join(HOOKS, hook.name);
  const modules: Modules = {
    core: await import(pathToFileURL(join(dir, "core.ts")).href),
  };
  if (existsSync(join(dir, "io.ts")))
    modules.io = await import(pathToFileURL(join(dir, "io.ts")).href);
  return modules;
};

// ── Replay ────────────────────────────────────────────────────────────────────

type Path = "in process" | "command.ts";

interface Sample {
  hook: string;
  path: Path;
  event: string;
  ms: number;
  acted: boolean;
  ran: boolean;
  ext: string;
  size: number;
  lines: number;
  partial: boolean;
  /** The start of the call, in ms since the epoch: it dates a stall. */
  at: number;
}

/** What the in-process pass learned of a call, for the command.ts pass. */
interface Known {
  ran: boolean;
  off: boolean;
  unsafe: boolean;
  acted: boolean;
}

interface Pass {
  samples: Sample[];
  known: Map<string, Known>;
  off: number;
  unsafe: number;
  failed: number;
  /** command.ts did or did not act where the core in process did not or did. */
  mismatch: number;
}

/** The environment of the hooks: no agent switch, TMPDIR in the fixture. */
function hookEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of [
    "CLAUDE_PROJECT_DIR",
    "AGENT_HOOKS_DISABLE",
    "CLAUDE_LINT_DISABLE",
    "AGENT_ALLOW_SECRETS",
    "AGENT_ALLOW_CLI_TOOLS",
  ])
    delete env[name];
  env.TMPDIR = SCRATCH;
  env.NODE_COMPILE_CACHE = join(BASE, "node-compile-cache");
  return env;
}

/** The hook payload of a call, as Claude Code sends it. */
function payload(c: Ctx, phase: Phase) {
  const base = { session_id: c.session, cwd: c.cwd };
  if (!c.call)
    return { ...base, hook_event_name: c.event, stop_hook_active: false };
  const { call } = c;
  return {
    ...base,
    hook_event_name:
      phase === "pre"
        ? "PreToolUse"
        : call.isError
          ? "PostToolUseFailure"
          : "PostToolUse",
    tool_name: call.tool,
    tool_use_id: call.id,
    tool_input:
      call.tool === "Bash"
        ? { command: c.command }
        : call.tool === "NotebookEdit"
          ? { notebook_path: c.filePath }
          : { file_path: c.filePath },
    tool_response: c.result,
  };
}

/** Runs command.ts once with the payload on stdin; its time and exit code. */
function command(
  hook: Hook,
  c: Ctx,
  phase: Phase,
): Promise<{ ms: number; code: number }> {
  const env = hookEnv();
  // track-session-changes writes under the home folder.
  if (hook.name === "track-session-changes") {
    env.HOME = c.world.home;
    env.GIT_CONFIG_GLOBAL = join(homedir(), ".gitconfig");
  }
  const input = JSON.stringify(payload(c, phase));
  return new Promise((resolve) => {
    const start = performance.now();
    const child = spawn(
      process.execPath,
      [join(HOOKS, hook.name, "command.ts"), ...(hook.args ?? [])],
      { cwd: c.cwd, env, stdio: ["pipe", "ignore", "ignore"] },
    );
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
    child.on("close", (code) =>
      resolve({ ms: performance.now() - start, code: code ?? -1 }),
    );
  });
}

const EXTENSIONS = new Set(
  "md markdown ts tsx js jsx mjs cjs mts cts json jsonl jsonc yaml yml toml sh bash fish zsh py org tf tfvars txt html css scss go rs lua nix tmpl conf ini xml svg csv sql el rb swift c h lock diff patch ipynb plist".split(
    " ",
  ),
);
/** An extension from a known list only, so no file name reaches the report. */
const extension = (path: string) => {
  const ext = extname(path).slice(1).toLowerCase();
  return EXTENSIONS.has(ext) ? `.${ext}` : ext ? "other" : "none";
};
const lineCount = (text: string) =>
  text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;

/** The extension, size, and line count that describe a case. */
function describe(c: Ctx, stop?: File[]) {
  if (c.call?.tool === "Bash") {
    const text = String(c.call.input.command ?? "");
    return {
      ext: "Bash command",
      size: Buffer.byteLength(text),
      lines: lineCount(text),
      partial: false,
    };
  }
  const files = stop ?? (c.call?.file ? [c.call.file] : []);
  if (!c.call && !stop)
    return { ext: "none", size: 0, lines: 0, partial: false };
  const exts = [...new Set(files.map((f) => extension(f.path)))].sort();
  return {
    ext:
      (exts.length > 3 ? [...exts.slice(0, 3), "more"] : exts).join(" ") ||
      "none",
    size: files.reduce((n, f) => n + Buffer.byteLength(f.text), 0),
    lines: files.reduce((n, f) => n + lineCount(f.text), 0),
    partial: files.some((f) => f.partial),
  };
}

const eventName = (event: Event, phases: Phase[]) =>
  event === "Stop" || event === "SessionStart"
    ? event
    : `${phases.map((p) => (p === "pre" ? "PreToolUse" : "PostToolUse")).join(" + ")} ${event}`;

/**
 * Replays the sessions through one hook on one path, one call at a time, and
 * stops after `max` calls. A call that the in-process pass found off or
 * unsafe is skipped on the command.ts pass.
 */
async function replay(
  hook: Hook,
  path: Path,
  m: Modules,
  sessions: Session[],
  sample: Set<string>,
  { tag, max, known }: { tag: string; max: number; known?: Map<string, Known> },
): Promise<Pass> {
  const pass: Pass = {
    samples: [],
    known: new Map(),
    off: 0,
    unsafe: 0,
    failed: 0,
    mismatch: 0,
  };
  let count = 0;
  const wants = (session: Session) =>
    session.calls.some(
      (call, i) =>
        (call.tool === "Bash"
          ? hook.on.Bash && sample.has(call.key)
          : hook.on[call.tool as Event]) ||
        (hook.on.Stop && session.stops.has(i)),
    ) || hook.on.SessionStart;

  const measure = async (
    c: Ctx,
    event: Event,
    phases: Phase[],
    between?: () => void,
    stop?: File[],
  ) => {
    const key = c.call ? c.call.key : `${c.world.session.index}/${event}`;
    const before = known?.get(key);
    if (before?.off || before?.unsafe) {
      if (between) between();
      return;
    }
    const probe = () =>
      hook.probe === "files"
        ? c.world.hash()
        : hook.probe === "log"
          ? c.world.log(c.session)
          : undefined;
    // The probe starts at the first phase, so the files that the Bash call
    // itself leaves (`between`) do not count as the work of a PostToolUse hook.
    let start: string | number | undefined;
    const at = Date.now();
    let ms = 0;
    let acted = false;
    let off = false;
    let exit = 0;
    for (const [n, phase] of ["pre", "post"].entries()) {
      if (n === 1 && between) between();
      if (!phases.includes(phase as Phase)) continue;
      start ??= probe();
      if (path === "in process") {
        const t = performance.now();
        try {
          const verdict = await hook.core(c, phase as Phase, m);
          acted ||= Boolean(verdict.acted);
          off ||= Boolean(verdict.off);
        } catch {
          // The adapters catch a throw too.
        }
        ms += performance.now() - t;
      } else {
        const ran = await command(hook, c, phase as Phase);
        ms += ran.ms;
        exit ||= ran.code;
      }
    }
    if (hook.probe) acted = probe() !== start;
    else if (path === "command.ts") acted = exit !== 0;
    const trace = c.trace;
    off ||= trace.runs.some(
      (run) => !run.ok && run.ms < 1000 && hook.tools.includes(run.program),
    );
    const ran = trace.runs.some(
      (run) => run.ok && hook.tools.includes(run.program),
    );
    if (path === "in process")
      pass.known.set(key, { ran, off, unsafe: trace.refused, acted });
    if (off) return void pass.off++;
    if (trace.refused) return void pass.unsafe++;
    if (before && before.acted !== acted) pass.mismatch++;
    pass.samples.push({
      hook: hook.name,
      path,
      event: eventName(event, phases),
      ms,
      acted,
      ran: before ? before.ran : ran,
      ...describe(c, stop),
      at,
    });
    count++;
    if (count % 250 === 0)
      process.stderr.write(`  ${hook.name} ${path}: ${count}\n`);
  };

  for (const session of sessions) {
    if (count >= max) break;
    if (!wants(session)) continue;
    const world = new World(
      session,
      join(BASE, "fixtures", hook.name, tag, String(session.index)),
      `${hook.name}/${tag}/${session.index}`,
    );
    world.setup(Boolean(hook.state));
    const id = `perf-${tag}-${session.index}`;
    const ctx = (call: Call | undefined, event: Event, cwd: string): Ctx => ({
      world,
      call,
      event,
      session: id,
      cwd,
      trace: { runs: [], refused: false },
    });
    if (hook.on.SessionStart)
      await measure(
        ctx(undefined, "SessionStart", world.map(session.cwd)),
        "SessionStart",
        hook.on.SessionStart,
      );
    for (const [i, call] of session.calls.entries()) {
      if (count >= max) break;
      const cwd = world.cwd(call);
      if (call.tool === "Bash") {
        const phases = hook.on.Bash;
        // The commit of the call stages first, so a scan sees a staged diff.
        if (hook.state && call.commits) world.stage();
        const after = () => {
          if (!hook.state) return;
          world.apply(call);
          if (call.commits) world.commit();
          if (hook.mtime) world.age(call.time);
        };
        if (phases && sample.has(call.key)) {
          const c = ctx(call, "Bash", cwd);
          c.command = world.command(String(call.input.command ?? ""));
          await measure(c, "Bash", phases, after);
        } else after();
      } else {
        if (hook.state) world.apply(call);
        const phases = call.tool === "Read" ? undefined : hook.on[call.tool];
        if (phases) {
          if (hook.skipFailed && (call.isError || !call.result)) pass.failed++;
          else {
            const c = ctx(call, call.tool as Event, cwd);
            const file = (call.input.file_path ?? call.input.notebook_path) as
              string | undefined;
            c.filePath = file === undefined ? undefined : world.map(file);
            if (call.result)
              c.result = {
                ...call.result,
                ...(typeof call.result.filePath === "string"
                  ? { filePath: world.map(call.result.filePath) }
                  : {}),
              };
            await measure(c, call.tool as Event, phases);
          }
        }
      }
      const stop = session.stops.get(i);
      if (stop && hook.on.Stop && count < max)
        await measure(
          ctx(undefined, "Stop", cwd),
          "Stop",
          hook.on.Stop,
          undefined,
          stop,
        );
    }
    world.remove();
  }
  return pass;
}

// ── Report ────────────────────────────────────────────────────────────────────

/** Nearest-rank percentile of sorted values. */
const percentile = (sorted: number[], p: number) =>
  sorted[Math.max(Math.ceil((p / 100) * sorted.length) - 1, 0)] ?? 0;
const round = (value: number) => Math.round(value * 100) / 100;
const pct = (part: number, all: number) =>
  all ? Math.round((100 * part) / all) : 0;
/** A call slower than this is a stall: the mean leaves it out. */
const STALL = 2000;

const csv = (rows: (string | number | boolean)[][]) =>
  rows
    .map((row) =>
      row
        .map((value) =>
          /[",\n]/.test(String(value))
            ? `"${String(value).replaceAll('"', '""')}"`
            : value,
        )
        .join(","),
    )
    .join("\n") + "\n";

interface Results {
  meta: Record<string, string | number>;
  hooks: {
    name: string;
    work: string;
    none?: string;
    /** The day of the run: a --hook run replaces some hooks only. */
    date: string;
    passes: Partial<Record<Path, Omit<Pass, "known">>>;
  }[];
}

/**
 * The agents that run a path of a hook, from the files in the work tree that
 * load the hooks: a mod, pi.ts, or omp.ts runs in process, and a command hook
 * runs command.ts, also through guard.sh.
 */
function loaders() {
  const read = (file: string) => readFileSync(join(REPO, file), "utf8");
  const claude = read("dot_claude/settings.json.tmpl");
  const mods = claude.match(/"CLAUDE_CODE_PLUGIN_DIRS".*/)?.[0] ?? "";
  const pi = read("dot_pi/agent/modify_settings.json");
  const omp = read("dot_omp/private_agent/private_config.yml");
  const codex = read("dot_codex/modify_hooks.json");
  return (hook: string, path: Path) =>
    (path === "in process"
      ? ([
          ["Claude Code", mods.includes(`"${hook}"`)],
          // omp loads pi.ts, omp.ts, or both: each runs in process.
          ["pi", pi.includes(`hooks/${hook}/`)],
          ["omp", omp.includes(`hooks/${hook}/`)],
        ] as const)
      : ([
          // The mod list names a hook only in quotes, never in a path.
          ["Claude Code", claude.includes(`hooks/${hook}/`)],
          ["Codex", codex.includes(`hooks/${hook}/`)],
        ] as const)
    )
      .filter(([, runs]) => runs)
      .map(([agent]) => agent)
      .join(", ");
}

function report(results: Results) {
  const { meta } = results;
  const agents = loaders();
  const dates = [...new Set(results.hooks.map((hook) => hook.date))].sort();
  const block: string[] = [
    `- Date: ${dates.length > 1 ? `${dates[0]} to ${dates.at(-1)}` : dates[0]}`,
    `- Commit: \`${meta.commit}\`, the hooks from a \`git archive\` of it`,
    `- Node: ${meta.node}`,
    `- CPU: ${meta.cpu}`,
    `- macOS: ${meta.macos}`,
    `- Run again: \`${meta.command}\``,
    `- Input: ${meta.transcripts} transcripts, ${meta.writes} Write, ${meta.edits} Edit, and ${meta.notebooks} NotebookEdit calls, ${meta.sample} of ${meta.bash} Bash calls (seed ${SEED}), ${meta.stops} turns that changed files.`,
    `- Edit rebuilds: ${meta.editOriginal} from \`originalFile\`, ${meta.editState} from the text that earlier calls left, ${meta.editHunks} from the patch hunks only.`,
  ];
  const summary: { session_ms: number; [column: string]: string | number }[] =
    [];
  const slowest: Sample[] = [];
  const notes: string[] = [];
  for (const hook of results.hooks) {
    if (hook.none) {
      notes.push(`- ${hook.name}: not measured, ${hook.none}.`);
      continue;
    }
    const all: Sample[] = [];
    for (const path of ["in process", "command.ts"] as Path[]) {
      const pass = hook.passes[path];
      if (!pass) {
        notes.push(
          `- ${hook.name}, ${path}: not measured, no ${path === "command.ts" ? "command.ts" : "in-process path"}.`,
        );
        continue;
      }
      all.push(...pass.samples);
      for (const event of new Set(pass.samples.map((s) => s.event))) {
        const rows = pass.samples.filter((s) => s.event === event);
        const sorted = rows.map((s) => s.ms).sort((a, b) => a - b);
        const kept = sorted.filter((ms) => ms <= STALL);
        const mean = kept.reduce((sum, ms) => sum + ms, 0) / kept.length;
        // A Bash row holds a sample of the Bash calls: scale it to all of them.
        const scale = event.endsWith("Bash")
          ? Number(meta.bash) / Number(meta.sample)
          : 1;
        const perSession = (rows.length * scale) / Number(meta.transcripts);
        // The key order is the column order: the columns to rank by first.
        summary.push({
          hook: hook.name,
          path,
          agents: agents(hook.name, path),
          event,
          session_ms: round(mean * perSession),
          mean_ms: round(mean),
          p95_ms: round(percentile(sorted, 95)),
          max_ms: round(sorted.at(-1) ?? 0),
          did_work_pct: pct(rows.filter((s) => s.acted).length, rows.length),
          calls: rows.length,
          per_session: round(perSession),
          p50_ms: round(percentile(sorted, 50)),
          p99_ms: round(percentile(sorted, 99)),
          tool_ran_pct: pct(rows.filter((s) => s.ran).length, rows.length),
        });
      }
      notes.push(
        ...[
          pass.off && `${pass.off} calls where the tool could not start`,
          pass.unsafe &&
            `${pass.unsafe} unsafe (a write outside the fixture, refused)`,
          pass.failed && `${pass.failed} failed calls that the adapter skips`,
          pass.mismatch &&
            `${pass.mismatch} calls where command.ts and the core in process disagree on "did work"`,
        ]
          .filter(Boolean)
          .map((note) => `- ${hook.name}, ${path}: ${note}, not counted.`),
      );
    }
    slowest.push(...all.sort((a, b) => b.ms - a.ms).slice(0, 5));
  }
  block.push("", '"Did work" per hook:', "");
  for (const hook of results.hooks)
    if (!hook.none) block.push(`- ${hook.name}: ${hook.work}.`);
  if (notes.length) block.push("", "Calls left out:", "", ...notes);
  return {
    block: block.join("\n"),
    summary: csv([
      Object.keys(summary[0] ?? {}),
      // The most expensive rows first.
      ...summary
        .sort((a, b) => b.session_ms - a.session_ms)
        .map((row) => Object.values(row)),
    ]),
    slowest: csv([
      [
        "hook",
        "path",
        "agents",
        "event",
        "ms",
        "extension",
        "hunks_only",
        "bytes",
        "lines",
      ],
      ...slowest
        .sort((a, b) => b.ms - a.ms)
        .map((s) => [
          s.hook,
          s.path,
          agents(s.hook, s.path),
          s.event,
          round(s.ms),
          s.ext,
          s.partial,
          s.size,
          s.lines,
        ]),
    ]),
  };
}

/** Writes the CSV files and their README in DIR/data. */
function publish(results: Results) {
  const { block, summary, slowest } = report(results);
  if (!flags.write) return void process.stdout.write(summary);
  const data = join(flags.write, "data");
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, "summary.csv"), summary);
  writeFileSync(join(data, "slowest.csv"), slowest);
  const intro =
    "`scripts/extensions/hooks/perf.ts` writes this file and the CSV files in this folder, so do not edit them. The [README](../README.md) tells how to read them.";
  writeFileSync(
    join(data, "README.md"),
    `# Run data\n\n${intro}\n\n${block}\n`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

/** mulberry32: a fixed seed gives the same Bash sample on every run. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const saved = join(BASE, "results.json");
  if (flags.render)
    return publish(JSON.parse(readFileSync(saved, "utf8")) as Results);
  if (!existsSync(HOOKS)) {
    const src = join(BASE, "src", HEAD);
    mkdirSync(src, { recursive: true });
    const archive = spawnSync("git", ["archive", HEAD, "dot_claude/hooks"], {
      cwd: REPO,
      maxBuffer: 1 << 30,
    });
    spawnSync("tar", ["-x", "-C", src], { input: archive.stdout });
  }
  // The in-process cores read the same environment as command.ts.
  Object.assign(process.env, hookEnv());
  for (const name of [
    "CLAUDE_PROJECT_DIR",
    "AGENT_HOOKS_DISABLE",
    "CLAUDE_LINT_DISABLE",
    "AGENT_ALLOW_SECRETS",
    "AGENT_ALLOW_CLI_TOOLS",
  ])
    delete process.env[name];
  rmSync(join(BASE, "fixtures"), { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  mkdirSync(LINT_CONFIG, { recursive: true });
  for (const name of ["yamllint", "ansible-lint", "tflint.hcl"])
    copyFileSync(
      join(HOOKS, "lint-code/config", `dot_${name}`),
      join(LINT_CONFIG, `.${name}`),
    );

  const files = readdirSync(PROJECTS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) =>
      readdirSync(join(PROJECTS, e.name))
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => join(PROJECTS, e.name, name)),
    )
    .sort();
  const sessions = files.map(parseSession);
  const calls = sessions.flatMap((s) => s.calls);
  const bash = calls.filter((c) => c.tool === "Bash").map((c) => c.key);
  const next = random(SEED);
  for (let i = bash.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [bash[i], bash[j]] = [bash[j]!, bash[i]!];
  }
  const sample = new Set(bash.slice(0, BASH_SAMPLE));
  const edits = calls.filter((c) => c.tool === "Edit" && c.edit);
  const date = new Date().toISOString().slice(0, 10);
  const results: Results = {
    meta: {
      commit: HEAD,
      node: process.version,
      cpu: output(["sysctl", "-n", "machdep.cpu.brand_string"]),
      macos: `${output(["sw_vers", "-productVersion"])} (${output(["sw_vers", "-buildVersion"])})`,
      command: "just hooks-perf",
      transcripts: files.length,
      writes: calls.filter((c) => c.tool === "Write").length,
      edits: calls.filter((c) => c.tool === "Edit").length,
      notebooks: calls.filter((c) => c.tool === "NotebookEdit").length,
      bash: bash.length,
      sample: sample.size,
      stops: sessions.reduce((n, s) => n + s.stops.size, 0),
      editOriginal: edits.filter((c) => c.edit === "originalFile").length,
      editState: edits.filter((c) => c.edit === "state").length,
      editHunks: edits.filter((c) => c.edit === "hunks").length,
    },
    hooks: [],
  };
  // A --hook run keeps the other hooks of the last run at the same commit.
  if (flags.hook && existsSync(saved)) {
    const last = JSON.parse(readFileSync(saved, "utf8")) as Results;
    if (last.meta.commit === HEAD)
      results.hooks = last.hooks.filter(
        (hook) => !flags.hook!.includes(hook.name),
      );
  }

  const chosen = HOOK_LIST.filter(
    (hook) => !flags.hook || flags.hook.includes(hook.name),
  );
  for (const hook of chosen) {
    const entry: Results["hooks"][number] = {
      name: hook.name,
      work: hook.work,
      none: hook.none,
      date,
      passes: {},
    };
    results.hooks.push(entry);
    // The table keeps the order of HOOK_LIST.
    const order = (name: string) => HOOK_LIST.findIndex((h) => h.name === name);
    results.hooks.sort((a, b) => order(a.name) - order(b.name));
    if (hook.none) continue;
    const m = await load(hook);
    let known: Map<string, Known> | undefined;
    for (const path of ["in process", "command.ts"] as Path[]) {
      if (path === "command.ts" && !hook.args) continue;
      process.stderr.write(`${hook.name} ${path}\n`);
      await replay(hook, path, m, sessions, sample, {
        tag: "warmup",
        max: WARMUP,
        known,
      });
      const pass = await replay(hook, path, m, sessions, sample, {
        tag: path === "in process" ? "core" : "command",
        max: LIMIT,
        known,
      });
      if (path === "in process") known = pass.known;
      const { known: _, ...kept } = pass;
      entry.passes[path] = kept;
      writeFileSync(saved, JSON.stringify(results));
    }
  }
  publish(results);
}

await main();
