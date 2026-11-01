/** Time one activity through final settlement, including retries and queued work.
 * Status only: no transcript entries, prompt changes, or saved timing data.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function duration(ms: number, showSeconds: boolean): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  if (!showSeconds) {
    if (seconds < 60) return "<1m";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
}

export default function taskTimer(pi: ExtensionAPI) {
  pi.registerFlag("task-timer-seconds", {
    description: "Show seconds in the task timer",
    type: "boolean",
    default: false,
  });
  let showSeconds: boolean | undefined;
  let updateStatus: (() => void) | undefined;
  let started: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let failed = false;

  const clear = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    started = undefined;
    failed = false;
    updateStatus = undefined;
  };
  const refresh = () => {
    updateStatus?.();
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    if (started !== undefined) {
      timer = setInterval(() => updateStatus?.(), showSeconds ? 1000 : 60_000);
      timer.unref();
    }
  };
  pi.registerCommand("task-timer", {
    description: "Toggle seconds in the task timer",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") return;
      showSeconds = !(showSeconds ?? pi.getFlag("task-timer-seconds") === true);
      refresh();
      ctx.ui.notify(`Task timer seconds: ${showSeconds ? "on" : "off"}`, "info");
    },
  });
  const start = (_event: unknown, ctx: ExtensionContext) => {
    if (ctx.mode !== "tui" || started !== undefined) return;
    showSeconds ??= pi.getFlag("task-timer-seconds") === true;
    started = performance.now();
    failed = false;
    updateStatus = () => {
      if (started !== undefined) {
        ctx.ui.setStatus(
          "task-timer",
          `Working: ${duration(performance.now() - started, showSeconds === true)}`,
        );
      }
    };
    refresh();
  };

  pi.on("before_agent_start", start);
  pi.on("agent_start", start);
  pi.on("agent_before_settle", (event) => {
    failed = event.outcome === "error";
  });
  pi.on("agent_settled", (event, ctx) => {
    if (started === undefined) return;
    const elapsed = performance.now() - started;
    const label = event.aborted ? "Stopped after" : failed ? "Failed after" : "Completed in";
    clear();
    updateStatus = () => {
      ctx.ui.setStatus("task-timer", `${label} ${duration(elapsed, showSeconds === true)}`);
    };
    refresh();
  });
  pi.on("session_shutdown", (_event, ctx) => {
    clear();
    showSeconds = undefined;
    if (ctx.mode === "tui") ctx.ui.setStatus("task-timer", undefined);
  });
}
