/**
 * pi and omp extension: blocks a bash call that runs a banned tool, with the
 * block message as the reason. Loaded through the link
 * ~/.pi/agent/extensions/enforce-cli-tools.ts, which omp reads through its
 * link to the pi extensions.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { blockMessage, violation } from "./core.ts";
import { inputs } from "./io.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "bash") return;
    const { command } = event.input as { command?: unknown };
    if (typeof command !== "string") return;
    try {
      const { rules, allowed } = inputs(ctx.cwd);
      const rule = violation(command, rules, allowed);
      if (rule)
        return { block: true, reason: blockMessage(command, rule, ctx.cwd) };
    } catch {
      // Fail open: pi blocks the call when a handler throws.
    }
  });
}
