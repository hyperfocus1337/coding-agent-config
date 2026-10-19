/**
 * Command hook for Codex (PostToolUse), and for the format-staged-files
 * pre-commit hook: reads the hook payload on stdin and formats the Terraform
 * files the call changed. Prints the amend hint as hookSpecificOutput JSON
 * when the call committed a file that terraform fmt then changed. Always
 * exits 0.
 *
 * Run: node command.ts
 */

import { readFileSync } from "node:fs";
import { format } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  cwd?: string;
  hook_event_name?: string;
  tool_input?: { file_path?: unknown; command?: unknown };
};
const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const hint = await format(
  {
    filePath: text(payload.tool_input?.file_path),
    command: text(payload.tool_input?.command),
    cwd: payload.cwd || process.cwd(),
  },
  nodeIo(),
  nodeSettings(),
);
// hookEventName must name the event that fired, or the output is invalid.
if (hint)
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: payload.hook_event_name || "PostToolUse",
        additionalContext: hint,
      },
    }),
  );
