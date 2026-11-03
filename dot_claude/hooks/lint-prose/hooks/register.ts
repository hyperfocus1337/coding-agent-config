/**
 * Claude Code mod: after a Write, Edit, or Bash call, lints the prose in the
 * files it changed and adds the alerts to the result as context for the
 * model. A Bash call names no file, so its files come from the log of
 * track-session-changes, which this mod must wrap: lint-prose comes before it
 * in CLAUDE_CODE_PLUGIN_DIRS. A message for the user only, such as a Vale
 * failure, goes to a notification. Fails open: a hook that throws is skipped
 * and the result stands.
 */

import type { Register } from "claude-code";
import { check, shellFiles, type Io } from "../core.ts";

export const register: Register = (on) => {
  on("tool.call", { tool: ["Write", "Edit", "Bash"] }, async ($, e, next) => {
    const since = Date.now();
    const ran = await next(e);
    // A denied call did not run. A failed Write or Edit wrote nothing, but a
    // failed Bash command can have written files.
    if (ran.deny !== undefined || (e.tool !== "Bash" && ran.isError)) return ran;
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
      // Rejects when the program is not installed, or timed out.
      run: (argv, cwd) => $.process.run(argv, { cwd }).catch(() => undefined),
    };
    const session = await $.session.id();
    const home = (await $.env.get("HOME")) ?? "";
    const files =
      e.tool === "Bash"
        ? await shellFiles(io, { home, agent: "claude", session }, "Bash", since, e.command)
        : [e.file_path];
    // Most Bash calls change no prose file, so they stop here.
    if (!files.length) return ran;
    const settings = {
      disable: await $.env.get("CLAUDE_LINT_DISABLE"),
      tmpdir: await $.env.get("TMPDIR"),
      valeDir: (await $.env.get("LINT_PROSE_VALE_DIR")) || `${home}/.config/vale`,
      hooksOff: await $.env.get("AGENT_HOOKS_DISABLE"),
    };
    const blocks: string[] = [];
    for (const file of files) {
      const { block, notice } = await check(file, session, io, settings);
      if (notice) await $.ui.notify(notice).catch(() => undefined);
      if (block) blocks.push(block);
    }
    if (!blocks.length) return ran;
    return {
      ...ran,
      context: [
        ...(ran.context ?? []),
        `Prose lint errors in the paragraphs this call changed. Fix them:\n${blocks.join("")}`,
      ],
    };
  });
};
