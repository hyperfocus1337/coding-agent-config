/**
 * Code mode: the model writes a block of JavaScript for the REPL tool, and each `write()`,
 * `edit()`, or `` $`...` `` in it runs as a Write, Edit, or Bash call with a tool_use_id that
 * starts with `repl_`. A format between two of these calls changes the text that a later
 * `edit()` of the same block expects, so the edit fails. The mod therefore defers each such call
 * to a file of its agent, and a flush formats them all when no block code waits on the files:
 *
 * - The end of the block: the PostToolUse REPL command hook, command.ts, for the agent of the
 *   block. The model gets the change notice before it writes its next block.
 * - The end of a turn: the mod, for the agent of the turn. The end of the session: the mod, for
 *   all agents. They catch a block that was interrupted or moved to the background, which gets
 *   no PostToolUse.
 *
 * File: ~/.cache/format-code/<session id>/<agent id, or main>.jsonl, one Call per line. A flush
 * renames the file before it reads it, so a call deferred during the flush goes to a new file.
 * No Node import, so the mod can run it.
 */

import { format, type Call, type Io, type Settings } from "./core.ts";

/** The agent key of the main loop, which has no agent id. */
const MAIN = "main";
/** A session or agent id becomes a path part, so it must not be a path. */
const safe = (name: string) => /^[\w.-]+$/.test(name) && !/^\.+$/.test(name);
const dirOf = (home: string, session: string) => `${home}/.cache/format-code/${session}`;

/** Whether a tool call runs inside a REPL block. The prefix is not documented: 2.1.328. */
export const inBlock = (toolUseId: unknown) =>
  typeof toolUseId === "string" && toolUseId.startsWith("repl_");

/**
 * Appends `call` to the deferred file of the agent. False when it could not, so the adapter
 * formats the call at once instead.
 */
export async function defer(
  io: Io,
  where: { home: string; session: string; agent?: string },
  call: Call,
): Promise<boolean> {
  const { home, session, agent = MAIN } = where;
  if (!safe(session) || !safe(agent)) return false;
  const ran = await io.run(
    [
      "sh",
      "-c",
      'mkdir -p "$1" && printf "%s\\n" "$3" >>"$1/$2.jsonl"',
      "sh",
      dirOf(home, session),
      agent,
      JSON.stringify(call),
    ],
    { cwd: home },
  );
  return ran?.exitCode === 0;
}

/**
 * Takes the files of `$@`, or each .jsonl file of the folder when none is named, and prints
 * them. With $2 = 1 (the session end), it also removes the folder when it is empty.
 */
const TAKE = `dir=$1 end=$2; shift 2
[ $# -gt 0 ] || set -- "$dir"/*.jsonl
for f; do [ -f "$f" ] && mv "$f" "$f.$$" 2>/dev/null && cat "$f.$$" && rm -f "$f.$$"; done
[ "$end" = 1 ] && rmdir "$dir" 2>/dev/null
exit 0`;

/**
 * Removes each empty session folder older than one day. A session that did not end, such as one
 * that was killed, keeps its folder.
 */
export const prune = (io: Io, home: string) =>
  io.run(
    // -empty keeps a folder with deferred calls; -mmin +1440 keeps a running session.
    [
      "find",
      `${home}/.cache/format-code`,
      "-mindepth",
      "1",
      "-maxdepth",
      "1",
      "-type",
      "d",
      "-empty",
      "-mmin",
      "+1440",
      "-delete",
    ],
    { cwd: home },
  );

/** A line of a deferred file, or undefined when it is not a Call. */
function parse(line: string): Call | undefined {
  try {
    const call = JSON.parse(line) as Record<string, unknown>;
    if (typeof call.cwd !== "string") return undefined;
    if (typeof call.filePath === "string") return { filePath: call.filePath, cwd: call.cwd };
    if (typeof call.command === "string")
      return {
        command: call.command,
        cwd: call.cwd,
        since: typeof call.since === "number" ? call.since : undefined,
      };
  } catch {
    // A line cut by a crash is skipped.
  }
  return undefined;
}

/**
 * Formats the deferred calls of `agent` (main loop: undefined), or of all agents with `all`,
 * and removes them. Returns the amend hints, as `format` does.
 */
export async function flush(
  io: Io,
  where: { home: string; session: string; agent?: string },
  settings: Settings,
  scope: { all?: boolean; end?: boolean } = {},
): Promise<string | undefined> {
  const { home, session, agent = MAIN } = where;
  if (!safe(session) || !safe(agent)) return undefined;
  const dir = dirOf(home, session);
  const files = scope.all ? [] : [`${dir}/${agent}.jsonl`];
  const ran = await io.run(["sh", "-c", TAKE, "sh", dir, scope.end ? "1" : "", ...files], {
    cwd: home,
  });
  const calls = (ran?.stdout ?? "").split("\n").flatMap((line) => parse(line) ?? []);
  const hints: (string | undefined)[] = [];
  // The named files of one folder go in one call, so each formatter runs once for them.
  const named = new Map<string, string[]>();
  for (const call of calls)
    if (call.filePath) named.set(call.cwd, [...(named.get(call.cwd) ?? []), call.filePath]);
    else hints.push(await format(call, io, settings));
  for (const [cwd, filePaths] of named) hints.push(await format({ filePaths, cwd }, io, settings));
  return hints.filter(Boolean).join("\n\n") || undefined;
}
