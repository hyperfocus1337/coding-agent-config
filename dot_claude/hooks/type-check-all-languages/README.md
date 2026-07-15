# type-check-all-languages

A `PostToolUse` hook that type-checks the whole project when Claude edits a typed-language file.

## How it works

Wired to `Write`, `Edit`, and `MultiEdit` in `settings.json`. It dispatches on the edited file's extension:

| Extension                  | Checker                         |
|----------------------------|---------------------------------|
| `.py`                      | [pyrefly](https://pyrefly.org/) |
| `.ts` `.tsx` `.mts` `.cts` | `tsc --noEmit`                  |

It runs at the project root, not just on the edited file, because type checkers need whole-project context. A missing checker is a silent skip, and errors go to stderr with exit 2 so Claude fixes them before moving on. The 30s timeout in `settings.json` caps runtime.

## Installing the checkers

Python type checking needs [pyrefly](https://pyrefly.org/):

```sh
uv tool install pyrefly
```

`tsc` normally comes from each project's own `typescript` dev dependency, so no global install is needed; the hook skips silently where it is absent.
