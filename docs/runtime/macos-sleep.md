# Keep agent sessions running while the Mac is locked

Locking the Mac does not stop a local agent session, but system sleep pauses its execution. This also affects agents inside a local devcontainer: when the Mac sleeps, Docker's virtual machine and its containers pause.

## Automatic sleep prevention in Claude Code

Claude Code on the Mac host prevents idle sleep while it works on a task. It starts `caffeinate -i -t 300` as a child process, starts it again every 4 minutes while the task continues, and stops it 30 seconds after the last task ends. If Claude Code exits without cleanup, the `-t 300` limit stops the process within 5 minutes. This is built in, with no setting to turn it off (seen in version 2.1.317).

This protection has two limits:

- It applies only on the Mac host. Claude Code inside a devcontainer runs on Linux and starts no `caffeinate` process.
- It stops between tasks. A session that waits for your next prompt does not keep the Mac awake.

Sleep monitors such as the Raycast Coffee extension count these processes as external caffeination, one for each Claude Code session that works.

## Prevent idle sleep manually

Use a manual `caffeinate` for agents in a devcontainer, for agents without built-in sleep prevention, or to keep the Mac awake between tasks.

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
- This repository configures no sleep prevention of its own. Tying it to the devcontainer lifetime would also keep the Mac awake while that container is idle; tracking only active sessions inside a devcontainer requires a host-side monitor.

See `man caffeinate` on the Mac host for the available flags.
