# format-code research

Timings and measurements behind the design of [`format-code`](../README.md). [`docs/hooks/performance/`](../../../../docs/hooks/performance/README.md) gives the time of the whole hook for each call.

## Run time

One `terraform fmt` run on one file takes about 15 ms. One shfmt run on a shell file of 152 lines takes about 1 ms (20 runs, 2026-10-21, in the devcontainer). So one run for each file costs little for these formatters.

## Emacs

With `--no-init-file`, one Emacs run takes about 1.4 s, and almost all of it is the start of Emacs. The alignment itself costs almost nothing. Without `--no-init-file`, Emacs loads the full user init (Doom, in this setup) on each run, and the run takes much longer than the timeout.

- **One run for all files:** five files take 1.6 s in one Emacs run, and 6.7 s in five runs.
- **Files without tables:** a file with no line that starts with `|` takes 0.02 s, because the hook does not start Emacs. A file with a table takes 1.4 s.

### Alignment loop and recalculation

On a file of about 1000 lines with about 90 tables, the explicit `org-table-align` loop takes about 1.4 s. `org-table-recalculate-buffer-tables` takes about 3.3 s and gives the same bytes.

## A Bash command that fails

Measured on 2026-09-19 with the earlier command hooks, which Claude Code ran only on `PostToolUse`. Two Bash calls wrote the same unaligned table to a literal path and differed only in the exit code. The exit 0 file came back aligned, and the exit 1 file stayed as it was. This held for the Markdown hook and for the Org hook.

## Parse errors

`lint-code` reports a file that does not parse: tflint for a `.tf` file, and shellcheck for a shell file. tflint checks a whole module folder, and `lint-code` limits its output to the edited file with `--filter`. `terraform validate` was not used, because it needs `terraform init`.

## Other hooks

[`hook-alternatives.md`](../../../../docs/research/hooks/hook-alternatives.md) found no official hook that formats Terraform files. No official hook formats shell files either.
