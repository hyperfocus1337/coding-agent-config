/** omp Stop: one correction, then report-only verification. */

import { check } from "./core.ts";
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
    const notices: string[] = [];
    let errors: string | undefined;
    try {
      errors = await check(ctx.cwd, nodeIo(ctx.cwd), {
        ...nodeSettings(),
        verify: final,
        notice: (message) => notices.push(message),
      });
    } catch (error) {
      notices.push(`Lint coverage incomplete: ${String(error)}`);
    }
    if (!errors && !notices.length) return;
    return {
      continue: !final && Boolean(errors),
      additionalContext: [...notices, ...(errors ? [errors] : [])].join("\n"),
    };
  });
}
