# lint-code research

## Tool choices

- **oxlint for JavaScript and TypeScript:** oxlint needs no config. It has a full recommended rule set built in and lints JS, TS, and JSX with no project config. So a project without a config lints cleanly, and does not give an error as eslint does with its flat config.
- **tflint for Terraform:** in October 2026, tflint is the Terraform linter that HashiCorp's `hashicorp/agent-skills` tells agents to run, after `terraform fmt` and `terraform validate`. Checkov and Trivy look for insecure settings, not for errors, and are too slow to run after each edit. `terraform validate` needs `terraform init`, and tflint does not.
- **tflint from mise:** Homebrew has no `tflint` formula (checked on 2026-10-21), so the README installs it with mise.
- **ruff from `uv` on Debian and Ubuntu:** `uv tool install ruff` keeps ruff apart from the system Python and installs the current release. `apt install ruff` works on recent distributions, but it ships an older build.

## Timings

One tflint run on a module of two files takes about 40 ms with the bundled `terraform` ruleset only, and about 200 ms with the `aws` and `azurerm` plugins (tflint 0.64.0, 2026-10-21, on the host).

[`docs/hooks/performance/`](../../../../docs/hooks/performance/README.md) gives the time that `lint-code` takes for each call, in process and through `command.ts`.
