/**
 * pi and omp extension: blocks a bash call that dcg denies, with the dcg reason.
 * In the pi TUI, a confirmable denial asks the user when the agent runs the
 * same command again, see README.md.
 * Loaded through the `extensions` setting of each agent.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { RETRY_HINT, retried, verdict } from "./core.ts";
import { nodeIo } from "./io.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const { command } = event.input as { command?: unknown };
    if (typeof command !== "string") return;
    // verdict() denies when dcg fails. pi also blocks if this handler throws.
    const denial = await verdict(command, nodeIo(ctx.cwd));
    if (!denial) return;
    // Only the TUI: an RPC client can be a program that answers dialogs itself.
    if (!denial.confirmable || ctx.mode !== "tui") return { block: true, reason: denial.reason };
    // The first denial goes to the agent, so that it looks for another way.
    // The same command again in the same session asks the user.
    if (!retried(ctx.sessionManager.getSessionId(), ctx.cwd, command))
      return { block: true, reason: `${denial.reason}\n\n${RETRY_HINT}` };
    if (
      await ctx.ui.confirm("dcg blocked a command. Run it once?", `${command}\n\n${denial.reason}`)
    )
      return;
    return { block: true, reason: denial.reason };
  });
}
