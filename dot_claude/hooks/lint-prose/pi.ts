/**
 * pi extension: lints the prose in the files a write or edit call changed.
 * On an alert it marks the result as an error with the alerts appended, so
 * the model fixes the text. A message for the user only goes to a
 * notification. Loaded through the `extensions` setting of pi and omp. omp
 * also loads ./omp.ts, which lints the files of an omp edit that this file
 * does not see.
 */

import { resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolResultEvent,
  ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", (event, ctx) => {
    // A failed edit wrote nothing.
    if (!["write", "edit"].includes(event.toolName) || event.isError) return;
    const { path } = event.input as { path?: unknown };
    if (typeof path !== "string") return;
    return checkFiles([resolve(ctx.cwd, path)], event.content, ctx);
  });
}

/**
 * Lints the prose in `files`. Returns `content` with the alerts appended and
 * the error flag, or undefined when no file is blocked. ./omp.ts calls it
 * too.
 */
export async function checkFiles(
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
      content: [
        ...content,
        { type: "text", text: `Prose lint errors:\n${blocks.join("")}` },
      ],
      isError: true,
    };
  } catch {
    // Advisory on failure: a broken lint run must not change the result.
  }
}
