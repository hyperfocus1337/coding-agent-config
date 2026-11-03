/** omp awaits session_stop, with stop_hook_active as the loop guard. */

import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

interface OmpApi {
  on(
    event: "session_stop",
    handler: (
      event: { stop_hook_active: boolean; last_assistant_message?: { stopReason?: string } },
      ctx: { cwd: string },
    ) => Promise<{ continue: true; additionalContext: string } | undefined>,
  ): void;
}

export default function (omp: OmpApi) {
  omp.on("session_stop", async (event, ctx) => {
    if (event.stop_hook_active) return;
    const reason = event.last_assistant_message?.stopReason;
    if (reason === "aborted" || reason === "error") return;
    try {
      const errors = await check(ctx.cwd, nodeIo(ctx.cwd), nodeSettings());
      if (errors === undefined) return;
      return { continue: true, additionalContext: errors };
    } catch {
      // Fails open: a broken check must not start a turn.
    }
  });
}
