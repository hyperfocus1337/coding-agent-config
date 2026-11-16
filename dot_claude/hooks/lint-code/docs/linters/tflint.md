# Terraform: tflint

Tflint runs in the module directory, with `--filter` to keep findings for the selected file. A parse failure can still refer to the whole module. A module-local `.tflint.hcl` or `.tflint.json` wins over the bundled configuration.

The hook does not install plugins. Initialize them on each machine, see [Requirements](../../README.md#requirements).
