/**
 * pi extension: records the files that a session changes through
 * ./core.ts. Loaded through the `extensions` setting of pi. omp loads
 * ./omp.ts instead, which runs `track` with the omp tools.
 *
 * bash: a git snapshot of the repos before and after the call.
 * edit: the input path and the `firstChangedLine` of the tool details, and
 * the file, read at the call, as the before blob.
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

/** A tool path as pi resolves it: without a leading @, with ~ expanded, against `cwd`. */
export const toolPath = (file: string, cwd: string) =>
  resolve(cwd, file.replace(/^@/, "").replace(/^~(?=\/|$)/, homedir()));

/** What differs between pi and omp. ./omp.ts gives the omp side. */
export interface Tools {
  /** The agent name, which names the log directory. */
  agent: string;
  /** True for a call that gets a git snapshot before and after it. */
  snapshots(toolName: string, input: Record<string, unknown>): boolean;
  /** The files that an edit or write input names, read at the call. */
  named(input: Record<string, unknown>): string[];
  /** The changes of a successful edit. */
  edited(
    details: unknown,
    input: Record<string, unknown>,
    cwd: string,
  ): Change[];
}

export const piTools: Tools = {
  agent: "pi",
  snapshots: (toolName) => toolName === "bash",
  named: ({ path }) => (typeof path === "string" ? [path] : []),
  edited: (details, { path }, cwd) =>
    typeof path === "string"
      ? [
          {
            status: "M",
            path: toolPath(path, cwd),
            line: (details as { firstChangedLine?: number } | undefined)
              ?.firstChangedLine,
          },
        ]
      : [],
};

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
  track(pi, piTools);
}

/** Records the changes of each call, as `tools` reads them. */
export function track(pi: ExtensionAPI, tools: Tools) {
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
    agent: tools.agent,
    session,
  });

  pi.on("session_start", () => guard(() => prune(io, homedir())));

  pi.on("tool_call", (event, ctx) =>
    guard(async () => {
      const session = where(ctx.sessionManager.getSessionId());
      const start = new Date();
      if (tools.snapshots(event.toolName, event.input)) {
        const pending = await beginCall(io, session, ctx.cwd);
        started.set(event.toolCallId, { start, pending, before: new Map() });
        return;
      }
      if (event.toolName !== "edit" && event.toolName !== "write") return;
      const before = new Map<string, string | undefined>();
      for (const file of tools.named(event.input)) {
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
      if (call?.pending)
        return endCall(io, session, call.pending, event.toolName);
      if (!call || event.isError) return;
      const end = new Date();
      if (event.toolName === "edit")
        return recordFiles(
          io,
          session,
          "edit",
          call.start,
          end,
          tools.edited(event.details, event.input, ctx.cwd).map((change) => ({
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
