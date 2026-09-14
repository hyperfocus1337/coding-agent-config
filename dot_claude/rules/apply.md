---
paths:
  - "dot_claude/**"
  - "dot_config/**"
  - "dot_doom.d/**"
---

### Apply

After a task that edits files in a chezmoi source directory succeeds, apply the source state before you report:

- In the default source (`chezmoi source-path`, which holds `dot_doom.d/`): run `/chezmoi:apply`. If the edit touched `dot_doom.d/`, run `/doom:sync` after it.
- In `coding-agent-config`, which is applied with `--source`: run `just chezmoi`.

Do not apply after a failed task. Report the failure instead.
