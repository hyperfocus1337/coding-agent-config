/**
 * Command hook for Claude Code and Codex: reads the hook payload on stdin and
 * records the files the tool call changed through ./core.ts.
 *
 * Run: node hook.ts <agent>, with <agent> claude or codex. The agent names the
 * log directory. Advisory: always exits 0 and prints nothing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  beginCall,
  changedLine,
  endCall,
  lineEndings,
  patchFiles,
  patchLine,
  prune,
  rebuildOriginal,
  recordFiles,
  type Edit,
  type Hunk,
} from "./core.ts";

interface Payload {
  hook_event_name?: string;
  session_id?: string;
  tool_use_id?: string;
  tool_name?: string;
  cwd?: string;
  duration_ms?: number;
  tool_input?: { file_path?: string; command?: string; notebook_path?: string };
  tool_response?: Edit & {
    type?: string;
    filePath?: string;
    structuredPatch?: Hunk[];
    originalFile?: string | null;
    error?: string;
    original_file?: string;
    updated_file?: string;
  };
}

const read = (file: string) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};

function run(agent: string, payload: Payload) {
  const {
    hook_event_name: event,
    session_id: session,
    tool_use_id: callId = "",
    tool_name: tool = "",
  } = payload;
  const cwd = payload.cwd ?? process.cwd();
  if (!session) return;
  if (event === "SessionStart") return prune();

  // Bash and apply_patch name no file, or no line, so they snapshot the repos.
  const patch =
    tool === "apply_patch"
      ? patchFiles(payload.tool_input?.command ?? "", cwd)
      : undefined;
  if (tool === "Bash" || patch) {
    if (event === "PreToolUse")
      beginCall(
        agent,
        session,
        callId,
        cwd,
        patch?.map((change) => change.path),
      );
    else if (event === "PostToolUse" || event === "PostToolUseFailure")
      endCall(agent, session, callId, tool, patch);
    return;
  }

  const result = payload.tool_response;
  const end = new Date();
  const start = new Date(end.getTime() - (payload.duration_ms ?? 0));

  // A NotebookEdit result holds the file text before and after the call. The
  // after blob comes from the file on disk, because `updated_file` can format
  // the JSON in another way.
  const notebook = payload.tool_input?.notebook_path;
  if (tool === "NotebookEdit") {
    if (event !== "PostToolUse" || !notebook || result?.error !== "") return;
    const line = changedLine(
      result.original_file ?? "",
      result.updated_file ?? "",
    );
    const change = {
      status: "M",
      path: path.resolve(cwd, notebook),
      line,
      old: result.original_file,
    } as const;
    return recordFiles(agent, session, tool, start, end, [change]);
  }

  // A successful Edit or Write returns structuredPatch. A failed one returns an error string.
  const file = payload.tool_input?.file_path ?? result?.filePath;
  if (
    event !== "PostToolUse" ||
    (tool !== "Edit" && tool !== "Write") ||
    !file ||
    !result?.structuredPatch
  )
    return;
  const status = result.type === "create" ? "A" : "M";
  const full = path.resolve(cwd, file);
  // The text before the call: `originalFile`, else a rebuild of the Edit.
  const after = status === "M" ? read(full) : undefined;
  const original =
    after === undefined
      ? undefined
      : (result.originalFile ??
        (tool === "Edit"
          ? rebuildOriginal(
              after.replace(/\r\n/g, "\n"),
              result,
              result.structuredPatch,
            )
          : undefined));
  const change = {
    status,
    path: full,
    line: patchLine(result.structuredPatch),
    old:
      original === undefined || after === undefined
        ? undefined
        : lineEndings(original, after),
  } as const;
  recordFiles(agent, session, tool, start, end, [change]);
}

try {
  const agent = process.argv[2];
  if (agent) run(agent, JSON.parse(fs.readFileSync(0, "utf8")) as Payload);
} catch {
  // Advisory: a failure must not block or disturb the tool call.
}
