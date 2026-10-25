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
    const { command, path } = event.input;
    const { cwd } = ctx;
    const calls: Call[] =
      event.toolName === "bash" && typeof command === "string"
        ? [{ command, cwd }]
        : ["write", "edit"].includes(event.toolName) && typeof path === "string"
          ? [{ filePath: path, cwd }]
          : [];
    return lintCalls(calls, event.content, cwd);
  });
}

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
    const found = new Set<string>();
    for (const call of calls) for (const file of await targets(call, io, settings)) found.add(file);
    const output = await lint([...found], io, settings);
    if (output === undefined) return;
    return {
      content: [...content, { type: "text", text: `Lint errors:\n${output}` }],
      isError: true,
    };
  } catch {
    // Advisory on failure: a broken lint run must not change the result.
  }
}
