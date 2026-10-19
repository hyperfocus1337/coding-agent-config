/**
 * node ~/.codex/hooks/apply-patch.ts <command.ts>
 *
 * Runs a hook's command.ts once for each file that a Codex apply_patch call
 * wrote. The PostToolUse payload of apply_patch carries the patch text in
 * tool_input.command and no tool_input.file_path, so this sends the hook a
 * Write payload for each file instead, as Claude Code does.
 *
 * Exits 2 if a run exits 2, because only 2 blocks and reaches the model.
 * Otherwise exits with the highest code, so a crash still shows as a warning.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const hook = process.argv[2];
if (!hook) {
  process.stderr.write("usage: apply-patch.ts <command.ts>\n");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  cwd?: string;
  tool_input?: { command?: unknown };
};
const cwd = payload.cwd || process.cwd();
const patch =
  typeof payload.tool_input?.command === "string"
    ? payload.tool_input.command
    : "";
const paths = new Set(
  [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)].map(
    ([, path]) => (isAbsolute(path!) ? path! : join(cwd, path!)),
  ),
);

let status = 0;
let blocked = false;
for (const path of paths) {
  // A deleted file, or the old side of a move, has nothing to check.
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) continue;
  const run = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({
      ...payload,
      tool_name: "Write",
      tool_input: { file_path: path },
    }),
    stdio: ["pipe", "inherit", "inherit"],
  });
  const code = run.status ?? 1;
  if (code === 2) blocked = true;
  status = Math.max(status, code);
}
process.exitCode = blocked ? 2 : status;
