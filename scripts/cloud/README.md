# cloud

Scripts for the CLI tools that [`templates/web/bootstrap.sh`](../../templates/web/bootstrap.sh) installs in cloud sessions from [`mise.toml`](../../templates/web/mise.toml) and [`mise.lock`](../../templates/web/mise.lock). Both need Docker.

| Script                 | Recipe                   | Does                                                                                                                                                                           |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`check.sh`](check.sh) | `just cloud-tools-check` | Installs `mise.toml` in locked mode in amd64 and arm64 containers that block the hosts the cloud refuses. Its mise steps mirror `bootstrap.sh`, so change both together.       |
| [`bump.sh`](bump.sh)   | `just cloud-tools-bump`  | Sets the dcg and chezmoi pins to the host versions, locks for both Linux platforms, and runs `check.sh`. It stops when the pins already match. You commit and push the change. |

Every cloud session fetches these files from `main`, so push only after `check.sh` passes. The monthly `mise-bump` script in the chezmoi dotfiles repository reminds you to run `just cloud-tools-bump` when it bumps dcg. See [`templates/web/README.md`](../../templates/web/README.md) for why the cloud install uses locked mode.
