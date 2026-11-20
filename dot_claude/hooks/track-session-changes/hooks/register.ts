/**
 * Claude Code mod: logs the files that a Bash, Write, Edit, or NotebookEdit
 * call changed, and prunes old logs at the start of a session. A Bash call is
 * snapshotted before `next` and compared after it, and the snapshot stays in
 * memory between the two. Advisory: each step catches its own errors, so a
 * failure never stops or changes the tool call.
 *
 * Code mode: format-code formats the files of a REPL block after the block.
 * The PostToolUse REPL command hook logs that format, and the end of a
 * main-loop turn or of the session logs the format of a block that ended
 * with no PostToolUse, such as an interrupted one (`reconcile`). This mod is
 * outside format-code, so its code after `next` runs after that format.
 */

import type { EngineInterface, Register } from "claude-code";
import { beginCall, commandDirs, dropCall, endCall, prune, reconcile, type Io } from "../core.ts";
import { recordTool, type ToolResult } from "../claude.ts";

const ok = (done: Promise<{ exitCode: number }>) =>
  done.then(
    (ran) => ran.exitCode === 0,
    () => false,
  );

/**
 * The `Io` of the core over `$`. `$.fs` has no append, copy, link, rename, or
 * remove, so those run a program. Each `$` call is spelled out here, as the
 * engine requires.
 */
const modIo = ($: EngineInterface): Io => ({
  read: (path) =>
    $.fs.read(path).then(
      (text) => text,
      () => undefined,
    ),
  write: (path, text) => $.fs.write(path, text),
  append: async (path, text) => {
    await $.process.run(["sh", "-c", 'mkdir -p "$(dirname "$1")" && cat >>"$1"', "sh", path], {
      stdin: text,
    });
  },
  exists: (path) => $.fs.exists(path).catch(() => false),
  mtime: (path) =>
    $.fs.stat(path).then(
      (found) => found.mtimeMs,
      () => undefined,
    ),
  list: (dir) =>
    $.fs.list(dir).then(
      (entries) => entries.map((entry) => entry.name),
      () => [],
    ),
  realpath: (path) =>
    $.fs.stat(path, { resolve: true }).then(
      (found) => found.realPath,
      () => undefined,
    ),
  mkdir: async (path) => {
    await ok($.process.run(["mkdir", "-p", path]));
  },
  copy: (from, to) => ok($.process.run(["cp", "-p", from, to])),
  link: (from, to) => ok($.process.run(["ln", from, to])),
  rename: (from, to) => ok($.process.run(["mv", from, to])),
  remove: async (path) => {
    // The core builds each path under the home folder; refuse anything else.
    if (path.startsWith("/") && path.split("/").length > 3)
      await ok($.process.run(["rm", "-rf", path]));
  },
  run: (argv, options) =>
    $.process.run(argv, options).then(
      (ran) => ({
        exitCode: ran.exitCode,
        stdout: ran.stdout,
        truncated: ran.isStdoutTruncated,
      }),
      () => undefined,
    ),
});

/**
 * The start of the first REPL block call since the last reconcile.
 * shortcut: a module variable, which a lost worker resets, and then that turn logs no format.
 * Upgrade path: `$.state`, with a contract in types/.
 * shortcut: one window for all agents, so a main-loop reconcile during a write of a background
 * subagent logs that write as Format. Upgrade path: format-code names the files that it changed.
 */
let blockSince: Date | undefined;

/** Logs the format of the REPL block files since `blockSince`. */
async function reconcileBlocks($: EngineInterface) {
  const since = blockSince;
  blockSince = undefined;
  const home = await $.env.get("HOME");
  if (!since || !home) return;
  await reconcile(modIo($), { home, agent: "claude", session: await $.session.id() }, since);
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    const started = await next(e);
    try {
      const home = await $.env.get("HOME");
      if (home) await prune(modIo($), home);
    } catch {
      // Advisory: the prune runs again at the next session start.
    }
    return started;
  });

  on("tool.call", { tool: ["Bash", "Write", "Edit", "NotebookEdit"] }, async ($, e, next) => {
    const io = modIo($);
    const begin = async () => {
      const home = await $.env.get("HOME");
      if (!home) return undefined;
      const where = { home, agent: "claude", session: await $.session.id() };
      // The engine needs a literal name here: the BASH_PATHS of the core.
      const bashPaths = await $.env.get("TRACK_SESSION_CHANGES_BASH_PATHS");
      return { where, cwd: await $.session.cwd(), start: new Date(), bashPaths };
    };
    const call = await begin().catch(() => undefined);
    if (!call) return next(e);
    // The tool_use_id prefix of a call in a REPL block, not documented: 2.1.328.
    if (e.tool_use_id?.startsWith("repl_")) blockSince ??= call.start;

    if (e.tool === "Bash") {
      const dirs = commandDirs(e.command, call.cwd, call.where.home, call.bashPaths);
      const pending = await beginCall(io, call.where, call.cwd, [], dirs).catch(() => undefined);
      let ran;
      try {
        ran = await next(e);
      } finally {
        // A denied call did not run, and a throw leaves nothing to compare.
        if (ran === undefined || ran.deny !== undefined)
          await dropCall(io, pending).catch(() => undefined);
      }
      if (ran.deny === undefined)
        await endCall(io, call.where, pending, "Bash").catch(() => undefined);
      return ran;
    }

    const ran = await next(e);
    if (ran.deny !== undefined || ran.isError) return ran;
    const file = e.tool === "NotebookEdit" ? e.notebook_path : e.file_path;
    await recordTool(
      io,
      call.where,
      e.tool,
      file,
      ran.result as ToolResult,
      call.cwd,
      call.start,
      new Date(),
    ).catch(() => undefined);
    return ran;
  });

  // A subagent turn can end while a main-loop block still runs, so only the main loop reconciles.
  on("turn.complete", async ($, e, next) => {
    const done = await next(e);
    if (e.agentId === undefined) await reconcileBlocks($).catch(() => undefined);
    return done;
  });

  on("session.end", async ($, e, next) => {
    const done = await next(e);
    await reconcileBlocks($).catch(() => undefined);
    return done;
  });
};
