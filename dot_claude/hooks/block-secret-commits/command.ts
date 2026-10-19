/**
 * Command hook for Claude Code and Codex (PreToolUse on Bash): reads the hook
 * payload on stdin and exits 2 with the block message on stderr when a
 * `git commit` would add a secret. A warning, such as a capped scan, goes to
 * stderr with exit 0. Prints nothing on stdout.
 *
 * Run: node command.ts
 */

import { readFileSync } from "node:fs";
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  cwd?: string;
  tool_input?: { command?: unknown };
};
const command = payload.tool_input?.command;
if (typeof command === "string") {
  // `||`: an empty CLAUDE_PROJECT_DIR falls back too, as `${VAR:-}` did.
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const verdict = await check(command, nodeIo(root), nodeSettings(root));
  for (const warning of verdict.warnings) process.stderr.write(`${warning}\n`);
  if (verdict.block) {
    process.stderr.write(`${verdict.block}\n`);
    process.exitCode = 2;
  }
}
