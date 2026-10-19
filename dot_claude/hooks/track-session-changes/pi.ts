/**
 * pi and omp extension: records the files that a session changes through
 * ./core.ts. Loaded through the `extensions` setting of each agent.
 *
 * bash: a git snapshot of the repos before and after the call.
 * edit: the paths and `firstChangedLine` of the tool details, and the files of
 * the input, read at the call, as the before blobs.
 * write: the old file, read at the call, against the file after the result.
 * Other tools that write files are not recorded. Advisory: a failure is
 * dropped and never reaches the tool call.
 */

import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  beginCall,
  changedLine,
  endCall,
  prune,
  recordFiles,
  resolve,
  type Change,
  type Pending,
  type Where,
} from "./core.ts";
import { nodeIo } from "./io.ts";

/** One file of an omp edit result. pi gives only `firstChangedLine`. */
interface EditFile {
  path?: string;
  op?: "create" | "update" | "delete";
  move?: string;
  sourcePath?: string;
  firstChangedLine?: number;
}

/** A tool path as pi resolves it: without a leading @, with ~ expanded, against `cwd`. */
const toolPath = (file: string, cwd: string) =>
  resolve(cwd, file.replace(/^@/, "").replace(/^~(?=\/|$)/, homedir()));

/**
 * The files of an edit result. A multi-file omp edit lists them in
 * `perFileResults`. A move logs the old path as D and the new path as A.
 */
export function editFiles(
  details: unknown,
  input: Record<string, unknown>,
  cwd: string,
): Change[] {
  const result = (details ?? {}) as EditFile & { perFileResults?: EditFile[] };
  const files = result.perFileResults ?? [result];
  const changes: Change[] = [];
  for (const file of files) {
    const named =
      file.path ?? (typeof input.path === "string" ? input.path : undefined);
    if (!named) continue;
    const status =
      file.op === "delete"
        ? "D"
        : file.op === "create" || file.move
          ? "A"
          : "M";
    if (file.move && file.sourcePath)
      changes.push({ status: "D", path: toolPath(file.sourcePath, cwd) });
    changes.push({
      status,
      path: toolPath(named, cwd),
      line:
        status === "D"
          ? undefined
          : (file.firstChangedLine ?? (status === "A" ? 1 : undefined)),
    });
  }
  return changes;
}

/**
 * A started call: its start, and either the snapshots of a bash call or the
 * text before it of each file that an edit or write names.
 */
interface Started {
  start: Date;
  pending?: Pending;
  before: Map<string, string | undefined>;
}

export default function trackSessionChanges(pi: ExtensionAPI) {
  // pi and omp set the process title to their name. It names the log directory.
  const agent = process.title === "omp" ? "omp" : "pi";
  const io = nodeIo();
  const started = new Map<string, Started>();
  const guard = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch {
      // Advisory: a failure must not block or disturb the tool call.
    }
  };
  const where = (session: string): Where => ({
    home: homedir(),
    agent,
    session,
  });

  pi.on("session_start", () => guard(() => prune(io, homedir())));

  pi.on("tool_call", (event, ctx) =>
    guard(async () => {
      const session = where(ctx.sessionManager.getSessionId());
      const start = new Date();
      if (event.toolName === "bash") {
        const pending = await beginCall(io, session, ctx.cwd);
        started.set(event.toolCallId, { start, pending, before: new Map() });
        return;
      }
      if (event.toolName !== "edit" && event.toolName !== "write") return;
      // An omp edit names its files in `paths`, a pi edit and a write in `path`.
      const { path: one, paths } = event.input as {
        path?: unknown;
        paths?: unknown;
      };
      const named = [one, ...(Array.isArray(paths) ? paths : [])].filter(
        (file): file is string => typeof file === "string",
      );
      const before = new Map<string, string | undefined>();
      for (const file of named) {
        const full = toolPath(file, ctx.cwd);
        before.set(full, await io.read(full));
      }
      started.set(event.toolCallId, { start, before });
    }),
  );

  pi.on("tool_result", (event, ctx) =>
    guard(async () => {
      const session = where(ctx.sessionManager.getSessionId());
      const call = started.get(event.toolCallId);
      started.delete(event.toolCallId);
      if (event.toolName === "bash")
        return endCall(io, session, call?.pending, "bash");
      if (!call || event.isError) return;
      const end = new Date();
      if (event.toolName === "edit")
        return recordFiles(
          io,
          session,
          "edit",
          call.start,
          end,
          editFiles(event.details, event.input, ctx.cwd).map((change) => ({
            ...change,
            old: call.before.get(change.path),
          })),
        );
      const [file, before] = [...call.before][0] ?? [];
      if (event.toolName === "write" && file) {
        const after = await io.read(file);
        if (after === undefined) return;
        const line = before === undefined ? 1 : changedLine(before, after);
        if (line === undefined) return;
        const status = before === undefined ? "A" : "M";
        await recordFiles(io, session, "write", call.start, end, [
          { status, path: file, line, old: before },
        ]);
      }
    }),
  );
}
