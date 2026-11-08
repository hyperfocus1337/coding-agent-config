/** One correction before settlement, then report-only final verification. */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { report } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

export default function (pi: ExtensionAPI) {
  let checked = false;
  pi.on("agent_settled", async (event, ctx) => {
    const verify = checked && !event.aborted;
    checked = false;
    if (!verify) return;
    const { errors, notices } = await report(ctx.cwd, nodeIo(ctx.cwd), {
      ...nodeSettings(),
      verify: true,
    });
    const reports = [...notices, ...(errors ? [errors] : [])];
    if (reports.length)
      pi.sendMessage({ customType: "lint-code", content: reports.join("\n"), display: true });
  });
  pi.on("agent_before_settle", async (event, ctx) => {
    if (checked || event.outcome !== "completed") return;
    checked = true;
    const { errors, notices } = await report(ctx.cwd, nodeIo(ctx.cwd), nodeSettings());
    if (!errors && !notices.length) return;
    return {
      entries: [
        ...event.entries,
        {
          type: "custom_message" as const,
          customType: "lint-code",
          content: [...notices, ...(errors ? [errors] : [])].join("\n"),
          display: true,
        },
      ],
      // Preserve another handler's continuation; notices alone never request one.
      continue: Boolean(errors) || event.continue,
    };
  });
}
