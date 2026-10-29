/**
 * pi and omp extension: blocks a bash call that dcg denies, with the dcg reason.
 * Loaded through the `extensions` setting of each agent.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { check } from "./core.ts";
import { nodeIo } from "./io.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const { command } = event.input as { command?: unknown };
    if (typeof command !== "string") return;
    // check() blocks when dcg fails. pi also blocks if this handler throws.
    const reason = await check(command, nodeIo(ctx.cwd));
    if (reason) return { block: true, reason };
  });
}
