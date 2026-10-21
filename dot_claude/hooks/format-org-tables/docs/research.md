# format-org-tables: research

Timings and measurements behind the design of [`format-org-tables`](../README.md). For the cost of the hook in real sessions, see [`docs/hooks/performance/`](../../../../docs/hooks/performance/README.md).

## Emacs start

With `--no-init-file`, one hook run takes about 1.4 s, and almost all of it is the start of Emacs. The alignment itself costs almost nothing. Without `--no-init-file`, Emacs loads the full user init (Doom, in this setup) on each run, and the run takes much longer than the timeout.

## One run for all files

Five files take 1.6 s in one Emacs run, and 6.7 s in five runs.

## Files without tables

A file with no line that starts with `|` takes 0.02 s, because the hook does not start Emacs. A file with a table takes 1.4 s.

## Alignment loop and recalculation

On a file of about 1000 lines with about 90 tables, the explicit `org-table-align` loop takes about 1.4 s. `org-table-recalculate-buffer-tables` takes about 3.3 s and gives the same bytes.

## A Bash command that fails

Measured on 2026-09-19 with the earlier command hook, which Claude Code ran only on `PostToolUse`. A Bash command that wrote an `.org` file and exited 0 got the file back with alignment. The same command with exit 1 left the file without alignment.
