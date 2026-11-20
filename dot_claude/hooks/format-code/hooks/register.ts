/**
 * Claude Code mod: after a Write, Edit, or Bash call, formats the files
 * it changed. A failed Bash call is formatted too: it may still have written
 * files. Adds the amend hint as context when the call committed a file that
 * a formatter then changed. Fails open: a hook that throws is
 * skipped and the result stands.
 *
 * A call inside a code mode REPL block is deferred instead, see ../deferred.ts:
 * the end of the block formats it through command.ts, and the end of a
 * main-loop turn or of the session formats what is left.
 */

import type { EngineInterface, Register } from "claude-code";
import { format, type Io } from "../core.ts";
import { defer, flush, inBlock, prune } from "../deferred.ts";

/**
 * The Io of the core over `$`. The engine only takes $ calls spelled at the
 * call site, so each function of the core is written out here.
 */
const modIo = ($: EngineInterface): Io => ({
  stat: (path) => $.fs.stat(path).catch(() => undefined),
  read: (path) => $.fs.read(path).catch(() => undefined),
  // Rejects when the program is not installed or times out.
  run: (argv, options) => $.process.run(argv, options).catch(() => undefined),
});

const settingsOf = async ($: EngineInterface) => ({
  tmpdir: await $.env.get("TMPDIR"),
  hooksOff: await $.env.get("AGENT_HOOKS_DISABLE"),
});

/** Formats the deferred calls of `agent` (main loop: undefined), or of all agents with `all`. */
async function flushDeferred(
  $: EngineInterface,
  scope: { agent?: string; all?: boolean; end?: boolean },
) {
  const home = await $.env.get("HOME");
  if (!home) return;
  const where = { home, session: await $.session.id(), agent: scope.agent };
  // Nothing reads the hint here.
  await flush(modIo($), where, await settingsOf($), scope);
}

export const register: Register = (on) => {
  on("tool.call", { tool: ["Write", "Edit", "Bash"] }, async ($, e, next) => {
    // The sweep of a Bash call keeps only the files changed after this time.
    const since = Date.now();
    const ran = await next(e);
    if (ran.deny !== undefined) return ran;
    const cwd = await $.session.cwd();
    const io = modIo($);
    const call =
      e.tool === "Bash" ? { command: e.command, since, cwd } : { filePath: e.file_path, cwd };
    const home = await $.env.get("HOME");
    if (inBlock(e.tool_use_id) && home) {
      const where = { home, session: await $.session.id(), agent: e.agentId };
      if (await defer(io, where, call)) return ran;
    }
    const hint = await format(call, io, await settingsOf($));
    if (!hint) return ran;
    return { ...ran, context: [...(ran.context ?? []), hint] };
  });

  // A block of another agent, such as a background subagent, can still run at a turn end, so the
  // turn end flushes only its own agent.
  on("turn.complete", async ($, e, next) => {
    const done = await next(e);
    await flushDeferred($, { agent: e.agentId }).catch(() => undefined);
    return done;
  });

  on("session.start", async ($, e, next) => {
    const started = await next(e);
    const home = await $.env.get("HOME");
    if (home) await prune(modIo($), home).catch(() => undefined);
    return started;
  });

  on("session.end", async ($, e, next) => {
    const done = await next(e);
    await flushDeferred($, { all: true, end: true }).catch(() => undefined);
    return done;
  });
};
