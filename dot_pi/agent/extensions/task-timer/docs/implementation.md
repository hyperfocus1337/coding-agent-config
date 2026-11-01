# Implementation

`index.ts` starts a monotonic timer at `before_agent_start`, with `agent_start` as a fallback. Repeated starts do not reset an active timer.

The native boolean CLI flag `--task-timer-seconds` defaults to false and initializes the setting on the first task or `/task-timer` command in a session. With seconds off, durations below one minute show `<1m`, and longer durations show whole minutes and hours. A one-minute interval publishes plain text with `ctx.ui.setStatus("task-timer", ...)`; enabling seconds uses a one-second interval and includes seconds in both live and final durations. The interval is unreferenced so it cannot keep the process alive.

`/task-timer` toggles seconds for the session and calls `refresh` to render the status again and replace any active interval. The retained status callback uses the live clock during work and a fixed elapsed duration after settlement. Toggling does not reset the start time or start an interval after settlement. Shutdown discards the callback and resets the setting to the CLI default.

`agent_end` does not stop the timer: retries, recovery, and queued work can still follow it. `agent_before_settle` records whether the proposed outcome is an error. `agent_settled` stops the interval and publishes the final duration, with cancellation taking precedence over errors. A later successful settlement replaces an earlier proposed error outcome.

`session_shutdown` clears all local state and removes the status. Cleanup is idempotent. Each extension runtime owns its timer; no state is restored from the session file. Non-terminal modes start no timer and publish no status.

`test/check.ts` uses Node's mock timers and a mocked monotonic clock to check the unset, disabled, and enabled flag values, command toggles before, during, and after tasks, update frequency, minute and hour boundaries, retries, completion, cancellation, errors, shutdown, and non-terminal modes. `just pi-check` also checks the entry point against the installed Pi types.
