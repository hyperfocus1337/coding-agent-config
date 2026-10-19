/**
 * Command hook for Codex (PostToolUse): reads the hook payload on stdin, lints
 * the files the call changed, and exits 2 with the linter output on stderr
 * when a linter fails. Exits 0 and prints nothing otherwise.
 *
 * Run: node command.ts
 */

import { readFileSync } from "node:fs";
import { lint, targets } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  cwd?: string;
  tool_input?: { file_path?: unknown; command?: unknown };
};
const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const cwd = payload.cwd || process.cwd();
const io = nodeIo(cwd);
const settings = nodeSettings();
const call = {
  filePath: text(payload.tool_input?.file_path),
  command: text(payload.tool_input?.command),
  cwd,
};
const output = await lint(await targets(call, io, settings), io, settings);
if (output !== undefined) {
  process.stderr.write(output);
  process.exitCode = 2;
}
