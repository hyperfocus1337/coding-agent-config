/**
 * Claude Code mod: after a Write or Edit call, lints the prose in the file it
 * changed and adds the alerts to the result as context for the model. A
 * message for the user only, such as a Vale failure, goes to a notification.
 * Fails open: a hook that throws is skipped and the result stands.
 */

import type { Register } from "claude-code";
import { check, type Io } from "../core.ts";

export const register: Register = (on) => {
  on("tool.call", { tool: ["Write", "Edit"] }, async ($, e, next) => {
    const ran = await next(e);
    // A denied or failed call wrote nothing.
    if (ran.deny !== undefined || ran.isError) return ran;
    // The engine only takes $ calls spelled at the call site, so each
    // function of the core is written out here.
    const io: Io = {
      isFile: (path) =>
        $.fs.stat(path).then(
          (found) => found.kind === "file",
          () => false,
        ),
      read: (path) => $.fs.read(path).catch(() => undefined),
      write: (path, text) => $.fs.write(path, text),
      run: (argv, cwd) =>
        $.process.run(argv, { cwd }).then(
          (done) => ({
            exitCode: done.exitCode,
            stdout: done.stdout,
            stderr: done.stderr,
          }),
          () => undefined, // not installed, or timed out
        ),
    };
    const home = await $.env.get("HOME");
    const { block, notice } = await check(
      e.file_path,
      await $.session.id(),
      io,
      {
        disable: await $.env.get("CLAUDE_LINT_DISABLE"),
        tmpdir: await $.env.get("TMPDIR"),
        valeDir:
          (await $.env.get("LINT_PROSE_VALE_DIR")) || `${home}/.config/vale`,
        hooksOff: await $.env.get("CLAUDE_HOOKS_DISABLE"),
      },
    );
    if (notice) await $.ui.notify(notice).catch(() => undefined);
    if (!block) return ran;
    return {
      ...ran,
      context: [
        ...(ran.context ?? []),
        `Prose lint errors in the paragraphs this call changed. Fix them:\n${block}`,
      ],
    };
  });
};
