### Apply

This repository is a chezmoi source directory. The host and the devcontainer (`coding-agent-sandbox-devcontainer`) each have their own home directory, and each needs its own apply.

After a task that edits `dot_claude/`, `dot_config/`, or `dot_pi/` succeeds, apply the source state before you report:

1. Find where you run. You are in the devcontainer if `/.dockerenv` exists or `DEVCONTAINER` is set. Otherwise you are on the host.
2. In the devcontainer, run `just chezmoi`. The devcontainer cannot reach the host home directory, so tell the user to run `just chezmoi` on the host.
3. On the host, run `docker ps -q --filter name=coding-agent-sandbox-devcontainer`. If it prints a container ID, run `just chezmoi-all`. This applies to the host, then runs `just chezmoi-devcontainer`. If it prints nothing, run `just chezmoi` and report that the devcontainer did not get the change.

Do not apply after a failed task. Report the failure instead.
