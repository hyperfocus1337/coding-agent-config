/**
 * Claude Code mod: logs the files that a Bash, Write, Edit, or NotebookEdit
 * call changed, and prunes old logs at the start of a session. A Bash call is
 * snapshotted before `next` and compared after it, and the snapshot stays in
 * memory between the two. Advisory: each step catches its own errors, so a
 * failure never stops or changes the tool call.
 */

import type { EngineInterface, Register } from "claude-code";
import {
  beginCall,
  dropCall,
  endCall,
  prune,
  recordTool,
  type Io,
  type ToolResult,
} from "../core.ts";

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
      return { where, cwd: await $.session.cwd(), start: new Date() };
    };
    const call = await begin().catch(() => undefined);
    if (!call) return next(e);

    if (e.tool === "Bash") {
      const pending = await beginCall(io, call.where, call.cwd).catch(() => undefined);
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
};
