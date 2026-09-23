### Apply

This repository is a chezmoi source directory, applied with `--source`. An edit under `dot_claude/`, `dot_config/`, or `dot_pi/` changes the source state only, not the home directory.

After a task that edits one of those directories succeeds, run `just chezmoi` before you report.

Do not apply after a failed task. Report the failure instead.
