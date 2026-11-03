/** Claude Code and Codex Stop hook: lint once, with one correction opportunity. */

import { readFileSync } from "node:fs";
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  cwd?: string;
  stop_hook_active?: unknown;
};
if (payload.stop_hook_active !== true) {
  try {
    const cwd = payload.cwd || process.cwd();
    const output = await check(cwd, nodeIo(cwd), nodeSettings());
    if (output !== undefined) {
      process.stderr.write(output);
      process.exitCode = 2;
    }
  } catch {
    // Fails open: a broken check must not block the stop.
  }
}
