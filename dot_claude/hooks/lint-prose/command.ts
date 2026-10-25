/**
 * Command hook for Codex (PostToolUse on apply_patch, through
 * dot_codex/hooks/apply-patch.ts): reads the hook payload on stdin and lints
 * the prose in the file it names. Exits 2 with the alerts on stderr, so they
 * reach the model. Exits 1 with a message for the user that does not block:
 * a Vale failure, a missing Vale config, or alerts this session already
 * reported. Exits 0 and prints nothing otherwise.
 *
 * Run: node command.ts
 */

import { readFileSync } from "node:fs";
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  session_id?: unknown;
  tool_input?: { file_path?: unknown };
};
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const { block, notice } = await check(
  text(payload.tool_input?.file_path),
  text(payload.session_id),
  nodeIo(),
  nodeSettings(),
);
const message = block ?? notice;
if (message) {
  process.stderr.write(message);
  process.exitCode = block ? 2 : 1;
}
