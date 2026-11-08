/** Claude Code and Codex Stop: one correction, then report-only verification. */

import { readFileSync } from "node:fs";
import { report } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  cwd?: string;
  stop_hook_active?: unknown;
};
const final = payload.stop_hook_active === true;
const cwd = payload.cwd || process.cwd();
const { errors, notices } = await report(cwd, nodeIo(cwd), { ...nodeSettings(), verify: final });
if (errors !== undefined) {
  if (final) notices.push(errors);
  else {
    process.stderr.write(errors);
    process.exitCode = 2;
  }
}
if (notices.length) {
  // Exit 0 on verification prevents another correction. Both clients display systemMessage.
  const text = notices.join("\n");
  process.stdout.write(JSON.stringify({ systemMessage: text }) + "\n");
  if (process.exitCode === 2) process.stderr.write(text + "\n");
}
