/**
 * omp extension: runs pyrefly on the project when the main agent is about
 * to stop. On errors it asks omp for one more turn with the errors as
 * context, so the model fixes them. Loaded through `extensions` in the omp
 * config, in place of ./pi.ts.
 *
 * `session_stop`, not the `agent_end` of pi.ts: omp does not await
 * `agent_end`, so the follow-up message of pi.ts is lost when omp settles
 * first. omp awaits `session_stop`, sends it in the main agent only, and sets
 * `stop_hook_active` on the stop after a continuation, which is the loop
 * guard (omp 18.12.2, src/session/agent-session.ts:5338 and :5353-5400).
 */

import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

/** The part of the omp event that this file reads (src/extensibility/shared-events.ts:110-120). */
interface SessionStopEvent {
  stop_hook_active: boolean;
  last_assistant_message?: { stopReason?: string };
}

/** src/extensibility/shared-events.ts:492-501. */
interface SessionStopResult {
  continue: true;
  additionalContext: string;
}

/** The part of the omp extension API that this file uses. The pi types have no omp events. */
interface OmpApi {
  on(
    event: "session_stop",
    handler: (
      event: SessionStopEvent,
      ctx: { cwd: string },
    ) => Promise<SessionStopResult | undefined>,
  ): void;
}

export default function (omp: OmpApi) {
  omp.on("session_stop", async (event, ctx) => {
    if (event.stop_hook_active) return;
    // A run that you stopped, or that failed, does not start another.
    const reason = event.last_assistant_message?.stopReason;
    if (reason === "aborted" || reason === "error") return;
    try {
      const errors = await check(ctx.cwd, nodeIo(), nodeSettings());
      if (errors === undefined) return;
      return { continue: true, additionalContext: errors };
    } catch {
      // Fails open: a broken check must not start a turn.
    }
  });
}
