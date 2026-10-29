#!/bin/sh
# Check the session and git config toggles without consuming the hook payload.
if printf '%s' "${AGENT_HOOKS_DISABLE:-}" | tr ',[:space:]' '\n' | grep -qx 'block-destructive-commands'; then
  exit 0
fi
if [ "$(git config --type=bool --get agent-hook.block-destructive-commands.enabled 2>/dev/null)" = false ]; then
  exit 0
fi
# Use an internal timeout before the agent's 10 s timeout. Codex can fail open
# on its own timeout. Node is also used by the other command hooks.
DCG_NO_SELF_HEAL=1 node -e '
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const run = spawnSync(join(process.env.HOME, ".local/bin/dcg"), [], {
  stdio: ["inherit", "pipe", "inherit"],
  encoding: "utf8",
  timeout: 5000,
  killSignal: "SIGKILL",
});
if (run.stdout) {
  if (run.status === 0) {
    try { JSON.parse(run.stdout); }
    catch {
      console.error("Blocked: dcg returned invalid JSON.");
      process.exit(2);
    }
  }
  process.stdout.write(run.stdout);
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
