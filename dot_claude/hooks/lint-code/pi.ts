/** Lints once before Pi settles; other checks share the same correction run. */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

export default function (pi: ExtensionAPI) {
  let checked = false;
  pi.on("agent_settled", () => {
    checked = false;
  });
  pi.on("agent_before_settle", async (event, ctx) => {
    if (checked || event.outcome !== "completed") return;
    // Mark even a pass, so another check's correction cannot start a loop.
    checked = true;
    try {
      const errors = await check(ctx.cwd, nodeIo(ctx.cwd), nodeSettings());
      if (errors === undefined) return;
      return {
        entries: [
          ...event.entries,
          {
            type: "custom_message" as const,
            customType: "lint-code",
            content: errors,
            display: true,
          },
        ],
        continue: true,
      };
    } catch {
      // Fails open: a broken check must not start a run.
    }
  });
}
