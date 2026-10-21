/**
 * Claude Code mod: adds `/toggle-hook`, which sets AGENT_HOOKS_DISABLE in
 * the Claude Code process. The mods read it on the next tool call, and the
 * command hooks and Bash calls started after get it. The status line names
 * the hooks that are off. Only the person can run the command: the Skill
 * tool refuses it (tested on 2026-10-19).
 */

import type { Register } from "claude-code";
import { status, toggle } from "../core.ts";

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "toggle-hook",
      description: "Turn an advisory hook off or on until you quit",
      argumentHint: "[hook|all]",
    });
    // A value set at launch shows from the start.
    $.ui.status(status(await $.env.get("AGENT_HOOKS_DISABLE")));
    return next(e);
  });
  on("command.run", { command: "toggle-hook" }, async ($, e) => {
    const { value, text } = toggle(
      await $.env.get("AGENT_HOOKS_DISABLE"),
      e.args,
    );
    const set = await $.env.set("AGENT_HOOKS_DISABLE", value);
    if (set.deny !== undefined) return { text: `Not changed: ${set.deny}` };
    $.ui.status(status(value));
    return { text };
  });
};
