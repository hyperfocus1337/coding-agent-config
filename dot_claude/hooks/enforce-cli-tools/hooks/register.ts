/**
 * Claude Code mod: denies a Bash call that runs a banned tool, with the block
 * message as the reason. Fails open: a hook that throws is skipped and the
 * call runs, as the command hook did.
 */

import type { Register } from "claude-code";
import { allowList, blockMessage, parseRules, violation } from "../core.ts";

export const register: Register = (on) => {
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const root = await $.session.root();
    // The engine only takes $ calls spelled at the call site, so each read is
    // inline. A missing file reads as "", which allows.
    const rules = await $.fs.read(`${$.plugin.root}/rules`).catch(() => "");
    const allowFile = await $.fs
      .read(`${root}/.claude-allow-cli-tools`)
      .catch(() => "");
    const allowed = allowList(
      allowFile,
      await $.env.get("CLAUDE_ALLOW_CLI_TOOLS"),
    );
    const rule = violation(e.command, parseRules(rules), allowed);
    return rule ? { deny: blockMessage(e.command, rule, root) } : next(e);
  });
};
