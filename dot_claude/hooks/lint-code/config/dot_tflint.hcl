# tflint config for a Terraform module that has no .tflint.hcl of its own.
# The hook passes this to tflint via `--config` when the folder of the file
# holds no .tflint.hcl or .tflint.json. Edit here to change the defaults.
# Install the plugins once with:
#   tflint --init --config ~/.claude/hooks/lint-code/config/.tflint.hcl
# A plugin that is not installed makes the hook skip Terraform files.

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

# Checks the values that AWS accepts, such as instance types. deep_check stays
# off: it calls the AWS API and needs credentials on each run.
plugin "aws" {
  enabled = true
  version = "0.49.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

plugin "azurerm" {
  enabled = true
  version = "0.32.0"
  source  = "github.com/terraform-linters/tflint-ruleset-azurerm"
}
