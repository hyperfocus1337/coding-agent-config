/** omp Stop: one correction, then report-only verification. */

import { report } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

interface OmpApi {
  on(
    event: "session_stop",
    handler: (
      event: { stop_hook_active: boolean; last_assistant_message?: { stopReason?: string } },
      ctx: { cwd: string },
    ) => Promise<{ continue: boolean; additionalContext: string } | undefined>,
  ): void;
}

export default function (omp: OmpApi) {
  omp.on("session_stop", async (event, ctx) => {
    const reason = event.last_assistant_message?.stopReason;
    if (reason === "aborted" || reason === "error") return;
    const final = event.stop_hook_active;
    const { errors, notices } = await report(ctx.cwd, nodeIo(ctx.cwd), {
      ...nodeSettings(),
      verify: final,
    });
    if (!errors && !notices.length) return;
    return {
      continue: !final && Boolean(errors),
      additionalContext: [...notices, ...(errors ? [errors] : [])].join("\n"),
    };
  });
}
