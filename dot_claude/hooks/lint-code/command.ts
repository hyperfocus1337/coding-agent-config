/** Claude Code and Codex Stop: one correction, then report-only verification. */

import { readFileSync } from "node:fs";
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  cwd?: string;
  stop_hook_active?: unknown;
};
const final = payload.stop_hook_active === true;
const notices: string[] = [];
try {
  const cwd = payload.cwd || process.cwd();
  const output = await check(cwd, nodeIo(cwd), {
    ...nodeSettings(),
    verify: final,
    notice: (message) => notices.push(message),
  });
  if (output !== undefined) {
    if (final) notices.push(output);
    else {
      process.stderr.write(output);
      process.exitCode = 2;
    }
  }
} catch (error) {
  notices.push(`Lint coverage incomplete: ${String(error)}`);
}
if (notices.length) {
  // Exit 0 on verification prevents another correction. Both clients display systemMessage.
  const report = notices.join("\n");
  process.stdout.write(JSON.stringify({ systemMessage: report }) + "\n");
  if (process.exitCode === 2) process.stderr.write(report + "\n");
}
