/** Publish lifecycle state for the sandbox's host bridge, not cmux's native hooks.
 * No prompts, tool data, socket access, notifications, or session-restore records.
 */
import { renameSync, writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function cmuxState(pi: ExtensionAPI) {
  const file = process.env.CMUX_PI_STATE_FILE;
  if (!file) return;
  let warned = false;
  const publish = (state: "idle" | "running" | "closed") => {
    try {
      writeFileSync(`${file}.tmp`, `${state}\n`, { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    } catch (error) {
      if (!warned) {
        console.warn(
          `[cmux-state] Cannot publish lifecycle state: ${String(error)}`,
        );
        warned = true;
      }
    }
  };
  pi.on("session_start", () => publish("idle"));
  pi.on("agent_start", () => publish("running"));
  // agent_end is not final: retries and queued work can still follow it.
  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.isIdle()) publish("idle");
  });
  pi.on("session_shutdown", () => publish("closed"));
}
