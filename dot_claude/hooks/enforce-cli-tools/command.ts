/**
 * Command hook for Codex (PreToolUse on Bash): reads the hook payload on
 * stdin and exits 2 with the block message on stderr when the command runs a
 * banned tool. Exits 0 and prints nothing otherwise.
 *
 * Run: node command.ts
 */

import { readFileSync } from "node:fs";
import { blockMessage, violation } from "./core.ts";
import { inputs } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  cwd?: string;
  tool_input?: { command?: unknown };
};
const command = payload.tool_input?.command;
if (typeof command === "string") {
  // `||`: an empty CLAUDE_PROJECT_DIR falls back too, as `${VAR:-}` did.
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const { rules, allowed } = inputs(root);
  const rule = violation(command, rules, allowed);
  if (rule) {
    process.stderr.write(`${blockMessage(command, rule, root)}\n`);
    process.exitCode = 2;
  }
}
