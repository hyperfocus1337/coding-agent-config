/**
 * pi and omp extension: formats the files a write, edit, or bash call changed,
 * and appends the amend hint to the result when the call committed a file
 * that Prettier then changed. Loaded through the `extensions` setting of each
 * agent.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { format } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    if (!["write", "edit", "bash"].includes(event.toolName)) return;
    const input = event.input as {
      path?: unknown;
      paths?: unknown;
      command?: unknown;
    };
    // A pi edit or write names its file in `path`, an omp edit in `paths`.
    const files = [
      input.path,
      ...(Array.isArray(input.paths) ? input.paths : []),
    ]
      .filter((file): file is string => typeof file === "string")
      .map((file) => (file.startsWith("/") ? file : `${ctx.cwd}/${file}`));
    const command =
      typeof input.command === "string" ? input.command : undefined;
    try {
      const calls =
        event.toolName === "bash"
          ? [{ command, cwd: ctx.cwd }]
          : files.map((filePath) => ({ filePath, cwd: ctx.cwd }));
      const hints: string[] = [];
      for (const call of calls) {
        const hint = await format(call, nodeIo(), nodeSettings());
        if (hint) hints.push(hint);
      }
      if (!hints.length) return;
      return {
        content: [
          ...event.content,
          ...hints.map((text) => ({ type: "text" as const, text })),
        ],
      };
    } catch {
      // Never blocks: a broken format run must not change the result.
    }
  });
}
