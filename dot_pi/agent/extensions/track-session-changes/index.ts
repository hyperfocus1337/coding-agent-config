/**
 * Records the files that a pi or omp session changes, through the shared
 * track-session-changes core (./core.ts, a link to ~/.claude/hooks). The same
 * file runs in omp through a link in ~/.omp/agent/extensions.
 *
 * bash: a git snapshot of the repos before and after the call.
 * edit: the paths and `firstChangedLine` of the tool details.
 * write: the old file, read at the call, against the file after the result.
 * Other tools that write files are not recorded. Advisory: a failure is
 * dropped and never reaches the tool call.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  beginCall,
  changedLine,
  endCall,
  prune,
  recordFiles,
  type Change,
} from "./core.ts";

/** One file of an omp edit result. pi gives only `firstChangedLine`. */
interface EditFile {
  path?: string;
  op?: "create" | "update" | "delete";
  move?: string;
  sourcePath?: string;
  firstChangedLine?: number;
}

/** A started edit or write: its start, and for a write the file before it. */
interface Started {
  start: Date;
  path?: string;
  before?: string;
}

/** A tool path as pi resolves it: without a leading @, with ~ expanded, against `cwd`. */
const toolPath = (file: string, cwd: string) =>
  resolve(cwd, file.replace(/^@/, "").replace(/^~(?=\/|$)/, homedir()));

const read = (file: string) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};

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

export default function trackSessionChanges(pi: ExtensionAPI) {
  // pi and omp set the process title to their name. It names the log directory.
  const agent = process.title === "omp" ? "omp" : "pi";
  const started = new Map<string, Started>();
  // A pi call ID holds | and a nested one holds /, which core rejects in a file name.
  const callName = (id: string) => createHash("sha1").update(id).digest("hex");
  const guard = (run: () => void) => {
    try {
      run();
    } catch {
      // Advisory: a failure must not block or disturb the tool call.
    }
  };

  pi.on("session_start", () => guard(() => prune()));

  pi.on("tool_call", (event, ctx) =>
    guard(() => {
      const session = ctx.sessionManager.getSessionId();
      if (event.toolName === "bash")
        return beginCall(agent, session, callName(event.toolCallId), ctx.cwd);
      if (event.toolName === "edit")
        started.set(event.toolCallId, { start: new Date() });
      if (event.toolName === "write" && typeof event.input.path === "string") {
        const file = toolPath(event.input.path, ctx.cwd);
        started.set(event.toolCallId, {
          start: new Date(),
          path: file,
          before: read(file),
        });
      }
    }),
  );

  pi.on("tool_result", (event, ctx) =>
    guard(() => {
      const session = ctx.sessionManager.getSessionId();
      if (event.toolName === "bash")
        return endCall(agent, session, callName(event.toolCallId), "bash");
      const call = started.get(event.toolCallId);
      started.delete(event.toolCallId);
      if (!call || event.isError) return;
      const end = new Date();
      if (event.toolName === "edit")
        return recordFiles(
          agent,
          session,
          "edit",
          call.start,
          end,
          editFiles(event.details, event.input, ctx.cwd),
        );
      if (event.toolName === "write" && call.path) {
        const after = read(call.path);
        if (after === undefined) return;
        const line =
          call.before === undefined ? 1 : changedLine(call.before, after);
        if (line === undefined) return;
        const status = call.before === undefined ? "A" : "M";
        recordFiles(agent, session, "write", call.start, end, [
          { status, path: call.path, line },
        ]);
      }
    }),
  );
}
