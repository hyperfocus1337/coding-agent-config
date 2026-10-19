/**
 * Command hook for Claude Code and Codex (Stop): reads the hook payload on
 * stdin and runs tsc on the project. Exits 2 with the errors on stderr, so
 * the stop is blocked and the model gets them. Exits 0 and prints nothing
 * otherwise, and when `stop_hook_active` is true: the hook already blocked
 * one stop, and a check that still fails must not block every stop after it.
 *
 * Not a mod in Claude Code: for a Team organization, the built-in
 * cc-plugin-sec-default skips user mods on classic.* events. See README.md.
 *
 * Run: node command.ts
 */

import { readFileSync } from "node:fs";
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  cwd?: unknown;
  stop_hook_active?: unknown;
};
if (payload.stop_hook_active !== true) {
  const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
  const errors = await check(cwd, nodeIo(), nodeSettings());
  if (errors !== undefined) {
    process.stderr.write(errors);
    process.exitCode = 2;
  }
}
