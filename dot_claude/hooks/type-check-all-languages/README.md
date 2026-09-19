# type-check-all-languages

A `Stop` hook that type-checks the whole project once, after Claude finishes responding.

## How it works

Wired to `Stop` in `settings.json`, with no matcher, because `Stop` takes none. `Stop` carries no file path, so the hook asks git what changed: `git diff --name-only HEAD` plus untracked files. It dispatches on the extensions in that list:

| Extension                  | Checker                         | Also needs      |
| -------------------------- | ------------------------------- | --------------- |
| `.py`                      | [pyrefly](https://pyrefly.org/) |                 |
| `.ts` `.tsx` `.mts` `.cts` | `tsc --noEmit`                  | `tsconfig.json` |

Both checkers run when both languages changed, so one turn reports every language. They run at the project root, not on single files, because type checkers need whole-project context. The changed-file list only decides which checker starts. A missing checker is a silent skip, and so is a directory that is not a git work tree. Errors go to stderr with exit 2, which blocks the stop and hands the output to Claude to fix. The 60s timeout in `settings.json` caps runtime.

`tsc` needs a `tsconfig.json` at the root. Without one it prints its whole help text and exits 1, which would block every stop with 100 lines of noise, so the hook skips it instead.

## Why `Stop` and not `PostToolUse`

The other file hooks run on `PostToolUse` because they act on the one file just edited. A type checker cannot: it reads the whole project. On `PostToolUse` it rechecks everything after every edit and reprints the same unrelated errors each time, which fills the context window with the same output over and over. On `Stop` it runs once per turn and still blocks the turn until the errors are gone.

`SessionEnd` does not work for this. Its output goes to the terminal as the process exits, so the model never reads it, and the event carries no file path either.

## The loop guard

The `Stop` payload sets `stop_hook_active` to `true` when this hook already blocked one stop. The hook reads that field and exits 0, so a check that Claude cannot fix does not block every stop after it.

## Installing the checkers

Python type checking needs [pyrefly](https://pyrefly.org/):

```sh
uv tool install pyrefly
```

`tsc` normally comes from each project's own `typescript` dev dependency, so no global install is needed; the hook skips silently where it is absent.
