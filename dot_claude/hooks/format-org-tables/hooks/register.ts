/**
 * Claude Code mod: after a Write, Edit, or Bash call, aligns the Org tables in
 * the files it changed. A failed Bash call is aligned too: it may still have
 * written files. Adds the amend hint as context when the call committed a
 * file that Emacs then changed. Fails open: a hook that throws is skipped and
 * the result stands.
 */

import type { Register } from "claude-code";
import { align, type Io } from "../core.ts";

export const register: Register = (on) => {
  on("tool.call", { tool: ["Write", "Edit", "Bash"] }, async ($, e, next) => {
    const ran = await next(e);
    if (ran.deny !== undefined) return ran;
    const cwd = await $.session.cwd();
    // The engine only takes $ calls spelled at the call site, so each
    // function of the core is written out here.
    const io: Io = {
      stat: (path) =>
        $.fs.stat(path).then(
          (found) => ({ kind: found.kind, mtimeMs: found.mtimeMs }),
          () => undefined,
        ),
      read: (path) => $.fs.read(path).catch(() => undefined),
      run: (argv, options) =>
        $.process.run(argv, options).then(
          (done) => ({ exitCode: done.exitCode, stdout: done.stdout }),
          () => undefined, // not installed, or timed out
        ),
    };
    const call =
      e.tool === "Bash"
        ? { command: e.command, cwd }
        : { filePath: e.file_path, cwd };
    const hint = await align(call, io, {
      tmpdir: await $.env.get("TMPDIR"),
    });
    if (!hint) return ran;
    return { ...ran, context: [...(ran.context ?? []), hint] };
  });
};
