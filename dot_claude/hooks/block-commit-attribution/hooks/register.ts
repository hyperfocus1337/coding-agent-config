/**
 * Claude Code mod: denies a Bash call that commits with a
 * `Co-Authored-By:` trailer. Fails open: a hook that throws is skipped
 * and the call runs, as the command hook did.
 */

import type { Register } from "claude-code";
import { violation } from "../core.ts";

export const register: Register = (on) => {
  on("tool.call", { tool: "Bash" }, async (_$, e, next) => {
    const reason = violation(e.command);
    return reason ? { deny: reason } : next(e);
  });
};
