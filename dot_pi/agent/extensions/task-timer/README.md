# Task timer

Shows elapsed time for the current task in Pi's extension status row. The installed `pi-footer` displays this row without extra configuration.

- While Pi works: `Working: 2m 13s`, updated each second.
- After completion: `Completed in 2m 48s`.
- After cancellation: `Stopped after 37s`.
- After an unrecovered error: `Failed after 12s`.

The final status stays until the next task starts. Timing includes tool calls, retries, compaction during the activity, queued continuations, and time spent waiting for approval. It excludes idle time between tasks. Queued prompts that continue the current activity share one timer.

This extension runs only in the terminal UI. It does not add transcript entries, change prompts, or save timing data. Reloading Pi or switching sessions clears the timer. Run `/reload` after installation to load it.

## Check

```bash
just pi-check
```

See [implementation details](docs/implementation.md).
