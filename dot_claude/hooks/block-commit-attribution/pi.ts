/**
 * pi and omp extension: blocks a bash call that commits with a
 * `Co-Authored-By:` trailer. Loaded through the `extensions` setting of
 * each agent.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { violation } from "./core.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (event.toolName !== "bash") return;
    const { command } = event.input as { command?: unknown };
    if (typeof command !== "string") return;
    const reason = violation(command);
    if (reason) return { block: true, reason };
  });
}
