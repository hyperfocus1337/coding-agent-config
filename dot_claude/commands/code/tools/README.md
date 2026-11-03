---
disable-model-invocation: true
---

# Repository tools

These prompt commands run the tools used by the installed hooks across the current repository. They are not new hook adapters or a separate tool runner.

| Command                    | Effect                                                       |
| -------------------------- | ------------------------------------------------------------ |
| `/code:tools:format`       | Report formatting differences without changing source files. |
| `/code:tools:format apply` | Format relevant files, then check them again.                |
| `/code:tools:lint`         | Report code and prose lint findings without fixing them.     |
| `/code:tools:lint fix`     | Apply supported safe automatic fixes, then lint again.       |
| `/code:tools:types`        | Check TypeScript and Python projects without fixing them.    |

Each command reads [shared.txt](shared.txt) for scope, hook controls, safety, and reporting rules. The shared file uses `.txt` so chezmoi deploys it without adding a slash command; command READMEs are excluded from deployment.

Checks cover all eligible repository files, not only changed files. Formatting and linting default to a non-writing check. A check never starts an apply or fix automatically, and type checking has no apply mode.

Automatic formatter hooks must be suspended through supported session controls during a run, then restored to their original state. If the agent cannot do this, the command stops and asks the user to suspend them. Security hooks remain enabled.
