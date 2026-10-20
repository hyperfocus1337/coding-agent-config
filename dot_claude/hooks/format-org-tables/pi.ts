/**
 * pi extension: aligns the Org tables in the files a write, edit, or bash
 * call changed, and appends the amend hint to the result when the call
 * committed a file that Emacs then changed. Loaded through the `extensions`
 * setting of pi and omp. omp also loads ./omp.ts, which aligns the Org
 * tables in the files of the omp calls that this file does not see.
 */

import type {
  ExtensionAPI,
  ToolResultEvent,
  ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { align, type Call } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", (event, ctx) => {
    if (!["write", "edit", "bash"].includes(event.toolName)) return;
    const { path, command } = event.input;
    const calls: Call[] =
      event.toolName === "bash"
        ? typeof command === "string"
          ? [{ command, cwd: ctx.cwd }]
          : []
        : typeof path === "string"
          ? [{ filePath: absolute(path, ctx.cwd), cwd: ctx.cwd }]
          : [];
    return alignCalls(calls, event.content);
  });
}

/** A tool path against the session folder. */
export const absolute = (file: string, cwd: string) =>
  file.startsWith("/") ? file : `${cwd}/${file}`;

/**
 * Aligns the Org tables in the files of `calls`. Returns `content` with the
 * amend hints appended, or undefined when there is no hint. ./omp.ts calls
 * it too.
 */
export async function alignCalls(
  calls: Call[],
  content: ToolResultEvent["content"],
): Promise<ToolResultEventResult | undefined> {
  try {
    const hints: string[] = [];
    for (const call of calls) {
      const hint = await align(call, nodeIo(), nodeSettings());
      if (hint) hints.push(hint);
    }
    if (!hints.length) return;
    return {
      content: [
        ...content,
        ...hints.map((text) => ({ type: "text" as const, text })),
      ],
    };
  } catch {
    // Never blocks: a broken align run must not change the result.
  }
}
