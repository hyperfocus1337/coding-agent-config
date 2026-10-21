/**
 * Claude Code mod: adds `/toggle-hook`, which sets AGENT_HOOKS_DISABLE in
 * the Claude Code process, or with `--repo` writes git config in the session
 * repository. The mods read both on the next tool call, and the command
 * hooks and Bash calls started after get the variable. The status line names
 * the hooks that are off. Only the person can run the command: the Skill
 * tool refuses it (tested on 2026-10-19).
 */

import type { Register } from "claude-code";
import { command, repoOff, status, type Git } from "../core.ts";

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "toggle-hook",
      description:
        "Turn an advisory hook off or on, until you quit or with --repo in this repository",
      argumentHint: "[--repo] [hook|all]",
    });
    // The engine only takes $ calls spelled at the call site. The process
    // runs in the session folder.
    const git: Git = (args) =>
      $.process.run(["git", ...args]).catch(() => undefined);
    // A value set at launch and the repository state show from the start.
    $.ui.status(
      status(await $.env.get("AGENT_HOOKS_DISABLE"), await repoOff(git)),
    );
    return next(e);
  });
  on("command.run", { command: "toggle-hook" }, async ($, e) => {
    const git: Git = (args) =>
      $.process.run(["git", ...args]).catch(() => undefined);
    const { value, text, repo } = await command(
      await $.env.get("AGENT_HOOKS_DISABLE"),
      e.args,
      git,
    );
    const set = await $.env.set("AGENT_HOOKS_DISABLE", value);
    if (set.deny !== undefined) return { text: `Not changed: ${set.deny}` };
    $.ui.status(status(value, repo));
    return { text };
  });
};
