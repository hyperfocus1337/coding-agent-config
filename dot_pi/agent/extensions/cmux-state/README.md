# cmux state

Publishes Pi lifecycle state for the host bridge in [`coding-agent-sandbox/scripts/agents/pi-cmux.py`](../../../../../coding-agent-sandbox/scripts/agents/pi-cmux.py). The sandbox's `just pi` launcher sets `CMUX_PI_STATE_FILE` to a private temporary file inside the container. Without that variable, this extension registers no handlers.

| Pi event                             | State     |
| ------------------------------------ | --------- |
| `session_start`                      | `idle`    |
| `agent_start`                        | `running` |
| `agent_settled`, when `ctx.isIdle()` | `idle`    |
| `session_shutdown`                   | `closed`  |

The host checks the latest state once per second and reports it to the cmux surface that launched Pi. It clears the indicator when `docker exec` exits, including an unexpected exit. Short transitions can occur between checks and will not appear in cmux.

This extension sends no prompts, tool data, credentials, or session IDs. It does not use the cmux socket, send notifications, create Feed events, or save session-restore data. The launcher's existing notification extension still handles completion notifications.

Apply with `just chezmoi` in the container, then start a new session with `just pi <project>` from a cmux pane on the host. `/reload` alone cannot add the launcher's event channel to an existing session.

## Check

Run `just pi-check`, or `node dot_pi/agent/extensions/cmux-state/test/check.ts`.
