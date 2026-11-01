#!/bin/sh
# Usage: guard.sh [--ask]. Claude Code passes --ask, see README.md#claude-code.
# Check the session and git config toggles without consuming the hook payload.
if printf '%s' "${AGENT_HOOKS_DISABLE:-}" | tr ',[:space:]' '\n' | grep -qx 'block-destructive-commands'; then
  exit 0
fi
if [ "$(git config --type=bool --get agent-hook.block-destructive-commands.enabled 2>/dev/null)" = false ]; then
  exit 0
fi
# Use an internal timeout before the agent's 10 s timeout. Codex can fail open
# on its own timeout. Node is also used by the other command hooks.
# shellcheck disable=SC2016 # The single quotes hold JavaScript, not shell.
GUARD_CORE="$(dirname "$0")/core.ts" GUARD_ASK="${1:-}" DCG_NO_SELF_HEAL=1 \
  node --input-type=module -e '
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const input = readFileSync(0, "utf8");
const run = spawnSync(join(process.env.HOME, ".local/bin/dcg"), [], {
  input,
  stdio: ["pipe", "pipe", "inherit"],
  encoding: "utf8",
  timeout: 5000,
  killSignal: "SIGKILL",
});
let stdout = run.stdout;
if (stdout) {
  if (run.status === 0) {
    let output;
    try { output = JSON.parse(stdout).hookSpecificOutput; }
    catch {
      console.error("Blocked: dcg returned invalid JSON.");
      process.exit(2);
    }
    // Turn a confirmable denial into the permission prompt of Claude Code, in
    // the modes that show it to the user (auto: tested 2026-11-01). Other
    // modes keep the denial.
    if (process.env.GUARD_ASK === "--ask" && output?.permissionDecision === "deny" &&
        ["default", "acceptEdits", "plan", "auto"].includes(JSON.parse(input).permission_mode)) {
      const { confirmable } = await import(pathToFileURL(process.env.GUARD_CORE).href);
      if (confirmable(output)) {
        const why = /^Reason: (.*)$/m.exec(output.permissionDecisionReason ?? "")?.[1];
        stdout = JSON.stringify({ hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `dcg ${output.ruleId}` + (why ? `: ${why}` : ""),
        } });
      }
    }
  }
  process.stdout.write(stdout);
}
if (run.error || run.signal || run.status !== 0) {
  console.error("Blocked: dcg denied the command or failed (" +
    (run.error?.message || run.signal || "exit " + run.status) + ").");
  process.exit(2);
}
'
status=$?
case $status in 0 | 2) exit "$status" ;; esac
echo "Blocked: the dcg hook could not run (node exit $status)." >&2
exit 2
