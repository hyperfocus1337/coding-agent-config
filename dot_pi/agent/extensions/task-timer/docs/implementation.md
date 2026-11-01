# Implementation

`index.ts` starts a monotonic timer at `before_agent_start`, with `agent_start` as a fallback. Repeated starts do not reset an active timer. A one-second interval publishes plain text with `ctx.ui.setStatus("task-timer", ...)`. The interval is unreferenced so it cannot keep the process alive.

`agent_end` does not stop the timer: retries, recovery, and queued work can still follow it. `agent_before_settle` records whether the proposed outcome is an error. `agent_settled` stops the interval and publishes the final duration, with cancellation taking precedence over errors. A later successful settlement replaces an earlier proposed error outcome.

`session_shutdown` clears all local state and removes the status. Cleanup is idempotent. Each extension runtime owns its timer; no state is restored from the session file. Non-terminal modes start no timer and publish no status.

`test/check.ts` uses Node's mock timers and a mocked monotonic clock to check live updates, retries, completion, cancellation, errors, hour formatting, shutdown, and non-terminal modes. `just pi-check` also checks the entry point against the installed Pi types.
