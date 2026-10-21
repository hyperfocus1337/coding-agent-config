/**
 * pi and omp extension: adds `/toggle-hook`, which sets AGENT_HOOKS_DISABLE
 * in the agent process. The extensions of the other hooks read it on their
 * next run. The status line names the hooks that are off. Loaded through the
 * `extensions` setting of each agent.
 *
 * No io.ts: the variable is the state, so this file reads and writes
 * process.env itself. In omp, a Bash call does not get the change (omp
 * 18.12.2), but no hook reads it there.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { HOOKS, status, toggle } from "./core.ts";

export default function (pi: ExtensionAPI) {
  // A value set at launch shows from the start.
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus("toggle-hook", status(process.env.AGENT_HOOKS_DISABLE));
  });
  pi.registerCommand("toggle-hook", {
    description: "Turn an advisory hook off or on until you quit",
    getArgumentCompletions: (prefix) =>
      [...HOOKS, "all"]
        .filter((name) => name.startsWith(prefix.trim()))
        .map((name) => ({ value: name, label: name })),
    handler: async (args, ctx) => {
      const { value, text } = toggle(process.env.AGENT_HOOKS_DISABLE, args);
      if (value === undefined) delete process.env.AGENT_HOOKS_DISABLE;
      else process.env.AGENT_HOOKS_DISABLE = value;
      ctx.ui.setStatus("toggle-hook", status(value));
      ctx.ui.notify(text, "info");
    },
  });
}
