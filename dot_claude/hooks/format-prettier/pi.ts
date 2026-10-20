/**
 * pi extension: formats the files a write, edit, or bash call changed, and
 * appends the amend hint to the result when the call committed a file that
 * Prettier then changed. Loaded through the `extensions` setting of pi and
 * omp. omp also loads ./omp.ts, which formats the files of the omp calls
 * that this file does not see.
 */

import type {
  ExtensionAPI,
  ToolResultEvent,
  ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { format, type Call } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", (event, ctx) => {
    if (!["write", "edit", "bash"].includes(event.toolName)) return;
    const input = event.input as { path?: unknown; command?: unknown };
    const command =
      typeof input.command === "string" ? input.command : undefined;
    const calls: Call[] =
      event.toolName === "bash"
        ? [{ command, cwd: ctx.cwd }]
        : typeof input.path === "string"
          ? [{ filePath: absolute(input.path, ctx.cwd), cwd: ctx.cwd }]
          : [];
    return formatCalls(calls, event.content);
  });
}

/** A tool path against the session folder. */
export const absolute = (file: string, cwd: string) =>
  file.startsWith("/") ? file : `${cwd}/${file}`;

/**
 * Formats the files of `calls`. Returns `content` with the amend hints
 * appended, or undefined when there is no hint. ./omp.ts calls it too.
 */
export async function formatCalls(
  calls: Call[],
  content: ToolResultEvent["content"],
): Promise<ToolResultEventResult | undefined> {
  try {
    const hints: string[] = [];
    for (const call of calls) {
      const hint = await format(call, nodeIo(), nodeSettings());
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
    // Never blocks: a broken format run must not change the result.
  }
}
