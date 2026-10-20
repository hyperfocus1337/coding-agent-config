/**
 * Claude Code mod: after a Write, Edit, or Bash call, formats the files it
 * changed with Prettier. A failed Bash call is formatted too: it may still
 * have written files. Adds the amend hint as context when the call committed
 * a file that Prettier then changed. Fails open: a hook that throws is
 * skipped and the result stands.
 */

import type { Register } from "claude-code";
import { format, type Io } from "../core.ts";

export const register: Register = (on) => {
  on("tool.call", { tool: ["Write", "Edit", "Bash"] }, async ($, e, next) => {
    const ran = await next(e);
    if (ran.deny !== undefined) return ran;
    const cwd = await $.session.cwd();
    // The engine only takes $ calls spelled at the call site, so each
    // function of the core is written out here.
    const io: Io = {
      stat: (path) => $.fs.stat(path).catch(() => undefined),
      read: (path) => $.fs.read(path).catch(() => undefined),
      // Rejects when the program is not installed, or timed out.
      run: (argv, options) =>
        $.process.run(argv, options).catch(() => undefined),
    };
    const call =
      e.tool === "Bash"
        ? { command: e.command, cwd }
        : { filePath: e.file_path, cwd };
    const hint = await format(call, io, {
      tmpdir: await $.env.get("TMPDIR"),
      hooksOff: await $.env.get("CLAUDE_HOOKS_DISABLE"),
    });
    if (!hint) return ran;
    return { ...ran, context: [...(ran.context ?? []), hint] };
  });
};
