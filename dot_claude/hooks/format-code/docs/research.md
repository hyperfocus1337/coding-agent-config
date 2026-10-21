# format-code research

## Run time

One `terraform fmt` run on one file takes about 15 ms. One shfmt run on a shell file of 152 lines takes about 1 ms (20 runs, 2026-10-21, in the devcontainer). So one run for each file costs little, and the hook does not need to format all files in one run. [`docs/hooks/performance/`](../../../../docs/hooks/performance/README.md) gives the time of the whole hook for each call.

## Parse errors

`lint-code` does not check Terraform, so nothing reports a Terraform file that does not parse to the model. A shell file that does not parse gets a shellcheck error from `lint-code`. `terraform validate` or tflint can do that, but both check a whole module folder, not one file. `terraform validate` also needs `terraform init`.

## Other hooks

[`hook-alternatives.md`](../../../../docs/research/hooks/hook-alternatives.md) found no official hook that formats Terraform files. No official hook formats shell files either.
