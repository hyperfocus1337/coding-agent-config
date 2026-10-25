/**
 * pi and omp extension: blocks a bash call when a `git commit` would add a
 * secret, with the block message as the reason. A warning, such as a capped
 * scan, goes to the user as a notification. Loaded through the `extensions`
 * setting of each agent.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const { command } = event.input as { command?: unknown };
    if (typeof command !== "string") return;
    // check() catches the errors of each scan itself: the binary scan blocks
    // and the content scan allows. pi blocks the call when a handler throws.
    const verdict = await check(command, nodeIo(ctx.cwd), nodeSettings(ctx.cwd));
    for (const warning of verdict.warnings) ctx.ui.notify(warning, "warning");
    if (verdict.block) return { block: true, reason: verdict.block };
  });
}
