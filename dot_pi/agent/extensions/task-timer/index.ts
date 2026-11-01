/** Time one activity through final settlement, including retries and queued work.
 * Status only: no transcript entries, prompt changes, or saved timing data.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function duration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
}

export default function taskTimer(pi: ExtensionAPI) {
  let started: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let failed = false;

  const clear = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    started = undefined;
    failed = false;
  };
  const start = (_event: unknown, ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || started !== undefined) return;
    started = performance.now();
    failed = false;
    const update = () => {
      if (started !== undefined) {
        ctx.ui.setStatus("task-timer", `Working: ${duration(performance.now() - started)}`);
      }
    };
    update();
    timer = setInterval(update, 1000);
    timer.unref();
  };

  pi.on("before_agent_start", start);
  pi.on("agent_start", start);
  pi.on("agent_before_settle", (event) => {
    failed = event.outcome === "error";
  });
  pi.on("agent_settled", (event, ctx) => {
    if (started === undefined) return;
    const elapsed = duration(performance.now() - started);
    const label = event.aborted ? "Stopped after" : failed ? "Failed after" : "Completed in";
    clear();
    ctx.ui.setStatus("task-timer", `${label} ${elapsed}`);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    clear();
    if (ctx.mode === "tui") ctx.ui.setStatus("task-timer", undefined);
  });
}
