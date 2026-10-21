# format-code research

## Run time

One `terraform fmt` run on one file takes about 15 ms. One shfmt run on a shell file of 152 lines takes about 1 ms (20 runs, 2026-10-21, in the devcontainer). So one run for each file costs little, and the hook does not need to format all files in one run. [`docs/hooks/performance/`](../../../../docs/hooks/performance/README.md) gives the time of the whole hook for each call.

## Parse errors

`lint-code` reports a file that does not parse: tflint for a `.tf` file, and shellcheck for a shell file. tflint checks a whole module folder, and `lint-code` limits its output to the edited file with `--filter`. `terraform validate` was not used, because it needs `terraform init`.

## Other hooks

[`hook-alternatives.md`](../../../../docs/research/hooks/hook-alternatives.md) found no official hook that formats Terraform files. No official hook formats shell files either.
