/**
 * pi extension: lints the files a write, edit, or bash call changed, and
 * marks the result as an error with the linter output appended, so the
 * model fixes the file. Loaded through the `extensions` setting of pi and
 * omp. omp also loads ./omp.ts, which lints the files of the omp calls that
 * this file does not see.
 */

import type {
  ExtensionAPI,
  ToolResultEvent,
  ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { lint, targets, type Call } from "./core.ts";
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
    return lintCalls(calls, event.content, ctx.cwd);
  });
}

/** A tool path against the session folder. */
export const absolute = (file: string, cwd: string) =>
  file.startsWith("/") ? file : `${cwd}/${file}`;

/**
 * Lints the files of `calls`. Returns `content` with the linter output
 * appended and the error flag, or undefined when no file failed. ./omp.ts
 * calls it too.
 */
export async function lintCalls(
  calls: Call[],
  content: ToolResultEvent["content"],
  cwd: string,
): Promise<ToolResultEventResult | undefined> {
  if (!calls.length) return;
  try {
    const io = nodeIo(cwd);
    const settings = nodeSettings();
    const found: string[] = [];
    for (const call of calls)
      for (const file of await targets(call, io, settings))
        if (!found.includes(file)) found.push(file);
    const output = await lint(found, io, settings);
    if (output === undefined) return;
    return {
      content: [...content, { type: "text", text: `Lint errors:\n${output}` }],
      isError: true,
    };
  } catch {
    // Advisory on failure: a broken lint run must not change the result.
  }
}
