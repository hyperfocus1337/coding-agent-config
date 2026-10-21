# Keep agent sessions running while the Mac is locked

Locking the Mac does not stop a local agent session, but system sleep pauses its execution. This also affects agents inside a local devcontainer: when the Mac sleeps, Docker's virtual machine and its containers pause.

## Prevent idle sleep

1. Open a terminal tab on the **Mac host**, not inside the devcontainer.
2. Run:

   ```sh
   caffeinate -i
   ```

3. Keep that tab open and start Claude or another agent as usual, locally or inside the devcontainer.
4. Lock the Mac with **Control–Command–Q**.
5. When the work is complete, press **Ctrl-C** in the host tab to allow idle sleep again.

The `-i` flag prevents idle system sleep. The display can still turn off, and the Mac stays locked. The assertion remains active until `caffeinate` exits, even if the agent finishes or waits for input. No configuration change is required.

## Why run it separately?

`caffeinate -i claude` keeps the Mac awake for the lifetime of the Claude executable, but it bypasses shell functions and aliases. This repository's `claude` shell function supplies custom settings, so use the separate host tab to preserve its behavior.

A Linux devcontainer cannot run macOS `caffeinate` or prevent the Mac host from sleeping. One host-side `caffeinate -i` process covers both local sessions and sessions inside local devcontainers.

## Limits

- Keep the laptop lid open. `-i` does not prevent lid-close sleep or an explicit Sleep command.
- Keep the Mac connected to power for long tasks. Sleep prevention does not prevent battery exhaustion.
- Keep the agent terminal connected. Sleep prevention does not protect a session from terminal closure, container shutdown, or Docker shutdown.
- An agent can still stop at a permission prompt or wait for input. Sleep prevention does not approve operations.
- No automatic sleep prevention is configured here. Tying it to the devcontainer lifetime would also keep the Mac awake while that container is idle; tracking only active Claude sessions would require a host-side monitor.

See `man caffeinate` on the Mac host for the available flags.
