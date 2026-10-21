# format-terraform research

## Run time

One `terraform fmt` run on one file takes about 15 ms. So one run for each file costs little, and the hook does not need to format all files in one run. [`docs/hooks/performance/`](../../../../docs/hooks/performance/README.md) gives the time of the whole hook for each call.

## Parse errors

`lint-code` does not check Terraform, so nothing reports a file that does not parse to the model. `terraform validate` or tflint can do that, but both check a whole module folder, not one file. `terraform validate` also needs `terraform init`.

## Other hooks

[`hook-alternatives.md`](../../../../docs/research/hooks/hook-alternatives.md) found no official hook that formats Terraform files.
