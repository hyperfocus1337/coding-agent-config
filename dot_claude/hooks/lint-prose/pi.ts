/**
 * pi extension: lints the prose in the files a write, edit, or bash call
 * changed. On an alert it marks the result as an error with the alerts
 * appended, so the model fixes the text. A message for the user only goes to
 * a notification. Loaded through the `extensions` setting of pi, after
 * track-session-changes: a bash call names no file, so its files come from
 * the log that track-session-changes writes in its own `tool_result`. omp
 * loads ./omp.ts in place of this file.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolResultEvent,
  ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { check, shellFiles } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

export default function (pi: ExtensionAPI) {
  lint(pi, "pi", ["bash"]);
}

/**
 * Lints the files of each write and edit call, and of each call of the
 * `shells` tools. `agent` names the log of track-session-changes.
 */
export function lint(pi: ExtensionAPI, agent: string, shells: string[]) {
  const since = new Map<string, number>();
  pi.on("tool_call", (event) => {
    if (shells.includes(event.toolName)) since.set(event.toolCallId, Date.now());
  });
  pi.on("tool_result", async (event, ctx) => {
    if (shells.includes(event.toolName)) {
      const start = since.get(event.toolCallId);
      since.delete(event.toolCallId);
      // A failed command can have written files, so isError does not count.
      if (start === undefined) return;
      const log = { home: homedir(), agent, session: ctx.sessionManager.getSessionId() };
      const text = JSON.stringify(event.input);
      const files = await shellFiles(nodeIo(), log, event.toolName, start, text).catch(() => []);
      return checkFiles(files, event.content, ctx);
    }
    // A failed edit wrote nothing.
    if (!["write", "edit"].includes(event.toolName) || event.isError) return;
    // omp sets `path` and `paths` for a hashline edit of one file, and only
    // `paths` for more than one file (omp 18.12.2,
    // src/extensibility/tool-event-input.ts:70-91). pi sets only `path`.
    const { path, paths } = event.input as { path?: unknown; paths?: unknown };
    const files = [path, ...(Array.isArray(paths) ? paths : [])]
      .filter((file): file is string => typeof file === "string")
      .map((file) => resolve(ctx.cwd, file));
    return checkFiles(files, event.content, ctx);
  });
}

/**
 * Lints the prose in `files`. Returns `content` with the alerts appended and
 * the error flag, or undefined when no file is blocked.
 */
async function checkFiles(
  files: string[],
  content: ToolResultEvent["content"],
  ctx: ExtensionContext,
): Promise<ToolResultEventResult | undefined> {
  try {
    const session = ctx.sessionManager.getSessionId();
    const io = nodeIo();
    const settings = nodeSettings();
    const blocks: string[] = [];
    for (const file of new Set(files)) {
      const { block, notice } = await check(file, session, io, settings);
      if (block) blocks.push(block);
      if (notice) ctx.ui.notify(notice, "warning");
    }
    if (!blocks.length) return;
    return {
      content: [...content, { type: "text", text: `Prose lint errors:\n${blocks.join("")}` }],
      isError: true,
    };
  } catch {
    // Advisory on failure: a broken lint run must not change the result.
  }
}
