/**
 * Command hook for Codex: reads the hook payload on stdin and records the
 * files the tool call changed through ./core.ts. Claude Code runs the mod in
 * hooks/register.ts instead; this hook also takes its payloads.
 *
 * Run: node command.ts <agent>, with <agent> codex or claude. The agent names
 * the log directory. Advisory: always exits 0 and prints nothing.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  beginCall,
  endCall,
  patchFiles,
  pendingFile,
  prune,
  recordTool,
  type Pending,
  type ToolResult,
  type Where,
} from "./core.ts";
import { nodeIo } from "./io.ts";

interface Payload {
  hook_event_name?: string;
  session_id?: string;
  tool_use_id?: string;
  tool_name?: string;
  cwd?: string;
  duration_ms?: number;
  tool_input?: { file_path?: string; command?: string; notebook_path?: string };
  /** A string for a failed call: an error, or "" in Codex. */
  tool_response?: ToolResult | string;
}

async function run(agent: string, payload: Payload) {
  const {
    hook_event_name: event,
    session_id: session,
    tool_use_id: callId = "",
    tool_name: tool = "",
  } = payload;
  const cwd = payload.cwd ?? process.cwd();
  if (!session) return;
  const io = nodeIo();
  const where: Where = { home: homedir(), agent, session };
  if (event === "SessionStart") return prune(io, where.home);

  // Bash and apply_patch name no file, or no line, so they snapshot the repos.
  // The snapshot waits in a file for the end event, which is another process.
  const patch =
    tool === "apply_patch"
      ? patchFiles(payload.tool_input?.command ?? "", cwd)
      : undefined;
  if (tool === "Bash" || patch) {
    const file = pendingFile(where, callId);
    if (!file) return;
    if (event === "PreToolUse") {
      const pending = await beginCall(
        io,
        where,
        cwd,
        patch?.map((change) => change.path),
      );
      if (pending) await io.write(file, JSON.stringify(pending));
    } else if (event === "PostToolUse" || event === "PostToolUseFailure") {
      const text = await io.read(file);
      await io.remove(file);
      const pending = text ? (JSON.parse(text) as Pending) : undefined;
      await endCall(io, where, pending, tool, patch);
    }
    return;
  }

  if (event !== "PostToolUse") return;
  const end = new Date();
  const start = new Date(end.getTime() - (payload.duration_ms ?? 0));
  const file =
    tool === "NotebookEdit"
      ? payload.tool_input?.notebook_path
      : payload.tool_input?.file_path;
  const result =
    typeof payload.tool_response === "object"
      ? payload.tool_response
      : undefined;
  await recordTool(io, where, tool, file, result, cwd, start, end);
}

try {
  const agent = process.argv[2];
  if (agent) await run(agent, JSON.parse(readFileSync(0, "utf8")) as Payload);
} catch {
  // Advisory: a failure must not block or disturb the tool call.
}
