/**
 * Claude Code mod: after a Write, Edit, or Bash call, lints the files it
 * changed and adds the linter output to the result as context for the model.
 * A failed Bash call is linted too: it may still have written files. Fails
 * open: a hook that throws is skipped and the result stands.
 */

import type { Register } from "claude-code";
import { lint, targets, type Io, type Settings } from "../core.ts";

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
          (found) => ({
            isFile: found.kind === "file",
            mtimeMs: found.mtimeMs,
          }),
          () => undefined,
        ),
      read: (path) => $.fs.read(path),
      run: (argv) =>
        $.process.run(argv, { cwd }).then(
          (done) => ({
            exitCode: done.exitCode,
            output: done.stdout + done.stderr,
          }),
          () => undefined, // not installed: skip the file
        ),
    };
    const settings: Settings = {
      configDir: `${$.plugin.root}/config`,
      disable: await $.env.get("CLAUDE_LINT_DISABLE"),
      tmpdir: await $.env.get("TMPDIR"),
    };
    const call =
      e.tool === "Bash"
        ? { command: e.command, cwd }
        : { filePath: e.file_path, cwd };
    const output = await lint(await targets(call, io, settings), io, settings);
    if (output === undefined) return ran;
    return {
      ...ran,
      context: [
        ...(ran.context ?? []),
        `Lint errors in the files this call changed. Fix them:\n${output}`,
      ],
    };
  });
};
