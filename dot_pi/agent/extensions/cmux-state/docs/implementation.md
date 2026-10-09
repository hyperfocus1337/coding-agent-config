# Implementation

The extension writes one state value to `CMUX_PI_STATE_FILE`. It writes a temporary file with mode `0600`, then renames it over the state file. The host therefore reads either the old complete value or the new complete value. The launcher creates the containing directory with `mktemp -d` inside the container and removes it on exit.

`agent_end` is not a final idle boundary in Pi 1.1. Retries, compaction, and queued work can continue after it. The extension uses `agent_settled` and checks `ctx.isIdle()` before publishing idle. Shutdown publishes closed; a subsequent session start, including reload, publishes idle again.

The host bridge accepts only `running`, `idle`, and `closed`, with a 32-byte read limit. It captures the host workspace, surface, and socket path before launching Docker. Only the state-file path enters the container. Workspace and surface IDs must be UUIDs before the bridge inserts them into cmux's line-based protocol.

The bridge sends `set_agent_lifecycle pi` and `set_status pi` scoped by `--tab` and `--panel`. On exit it sets the lifecycle to `unknown` and sends `clear_status pi`. It does not register a PID or a resume binding: the host cannot use a container PID or Pi session path for hibernation or restore. It bypasses native `cmux hooks pi` because those hooks also write host session-restore records.

Publication errors warn once and do not stop Pi. Host transport calls have timeouts and retry the latest state on the next check. Cleanup errors remain visible. A killed host bridge, such as `SIGKILL`, cannot run cleanup; restart the launcher or clear the stale Pi status in cmux.
