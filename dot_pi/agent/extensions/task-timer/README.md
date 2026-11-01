# Task timer

Shows elapsed time for the current task in Pi's extension status row. The installed `pi-footer` displays this row without extra configuration.

- While Pi works: `Working: 2m`, updated each minute.
- After completion: `Completed in 2m`.
- After cancellation: `Stopped after <1m`.
- After an unrecovered error: `Failed after <1m`.

Run `/task-timer` to toggle seconds on or off for the current session. The command immediately updates the live or final status without resetting elapsed time. It also changes the live update frequency. The choice resets on reload or session switch.

Seconds are off by default. Durations below one minute show `<1m`; longer durations show whole minutes, such as `2m` or `1h 2m`. To show seconds and update each second, start Pi with:

```bash
pi --task-timer-seconds
```

With this flag, durations show as `37s`, `2m 13s`, or `1h 2m 13s`. The flag applies to both the live timer and the final status.

The final status stays until the next task starts. Timing includes tool calls, retries, compaction during the activity, queued continuations, and time spent waiting for approval. It excludes idle time between tasks. Queued prompts that continue the current activity share one timer.

This extension runs only in the terminal UI. It does not add transcript entries, change prompts, or save timing data. Reloading Pi or switching sessions clears the timer. Run `/reload` after installation to load it.

## Check

```bash
just pi-check
```

See [implementation details](docs/implementation.md).
