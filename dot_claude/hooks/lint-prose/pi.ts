/**
 * pi and omp extension: lints the prose in the files a write or edit call
 * changed. On an alert it marks the result as an error with the alerts
 * appended, so the model fixes the text. A message for the user only goes to
 * a notification. Loaded through the `extensions` setting of each agent.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    // A failed edit wrote nothing.
    if (!["write", "edit"].includes(event.toolName) || event.isError) return;
    const input = event.input as { path?: unknown; paths?: unknown };
    // A pi edit or write names its file in `path`, an omp edit in `paths`.
    const files = [
      input.path,
      ...(Array.isArray(input.paths) ? input.paths : []),
    ]
      .filter((file): file is string => typeof file === "string")
      .map((file) => (file.startsWith("/") ? file : `${ctx.cwd}/${file}`));
    try {
      const session = ctx.sessionManager.getSessionId();
      const blocks: string[] = [];
      for (const file of new Set(files)) {
        const { block, notice } = await check(
          file,
          session,
          nodeIo(),
          nodeSettings(),
        );
        if (block) blocks.push(block);
        if (notice) ctx.ui.notify(notice, "warning");
      }
      if (!blocks.length) return;
      return {
        content: [
          ...event.content,
          { type: "text", text: `Prose lint errors:\n${blocks.join("")}` },
        ],
        isError: true,
      };
    } catch {
      // Advisory on failure: a broken lint run must not change the result.
    }
  });
}
