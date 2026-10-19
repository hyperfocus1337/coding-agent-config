/**
 * pi and omp extension: runs tsc on the project when a run ends. On errors it
 * sends them to the model as a follow-up message that starts one more run, so
 * the model fixes them. The end of that run passes without a check: pi and
 * omp have no `stop_hook_active`, so this flag is the loop guard. Loaded
 * through the `extensions` setting of each agent.
 *
 * `agent_end`, not pi's `agent_before_settle`: omp 18.10.3 does not have that
 * event, and both agents have `sendMessage` with `triggerTurn`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { check } from "./core.ts";
import { nodeIo } from "./io.ts";

export default function (pi: ExtensionAPI) {
  // True after this extension started a run: its end passes.
  let continued = false;
  pi.on("agent_end", async (event, ctx) => {
    if (continued) {
      continued = false;
      return;
    }
    // omp sets willContinue when the run goes on by itself: check at the end.
    if ((event as { willContinue?: boolean }).willContinue) return;
    // A run that you stopped, or that failed, does not start another.
    const last = event.messages.at(-1);
    if (
      last?.role === "assistant" &&
      ["aborted", "error"].includes(last.stopReason)
    )
      return;
    try {
      const errors = await check(ctx.cwd, nodeIo());
      if (errors === undefined) return;
      continued = true;
      pi.sendMessage(
        {
          customType: "type-check-tsc",
          content: errors,
          display: true,
        },
        { triggerTurn: true, deliverAs: "followUp" },
      );
    } catch {
      // Fails open: a broken check must not start a run.
      continued = false;
    }
  });
}
