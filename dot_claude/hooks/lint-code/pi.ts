/**
 * pi and omp extension: lints the files a write, edit, or bash call changed,
 * and marks the result as an error with the linter output appended, so the
 * model fixes the file. Loaded through the `extensions` setting of each agent.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { lint, targets } from "./core.ts";
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
      const io = nodeIo(ctx.cwd);
      const settings = nodeSettings();
      const calls =
        event.toolName === "bash"
          ? [{ command, cwd: ctx.cwd }]
          : files.map((filePath) => ({ filePath, cwd: ctx.cwd }));
      const found: string[] = [];
      for (const call of calls)
        for (const file of await targets(call, io, settings))
          if (!found.includes(file)) found.push(file);
      const output = await lint(found, io, settings);
      if (output === undefined) return;
      return {
        content: [
          ...event.content,
          { type: "text", text: `Lint errors:\n${output}` },
        ],
        isError: true,
      };
    } catch {
      // Advisory on failure: a broken lint run must not change the result.
    }
  });
}
