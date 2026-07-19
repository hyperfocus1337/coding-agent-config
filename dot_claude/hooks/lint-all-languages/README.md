# lint-all-languages

A `PostToolUse` hook that lints each file Claude writes, dispatching by extension.

## How it works

Wired to `Write`, `Edit`, and `MultiEdit` in `settings.json`. It lints the edited file based on its extension:

| Extension                               | Linter                                           |
|-----------------------------------------|--------------------------------------------------|
| `.py`                                   | [ruff](https://docs.astral.sh/ruff/)             |
| `.js` `.jsx` `.ts` `.tsx` `.mjs` `.cjs` | [oxlint](https://oxc.rs/docs/guide/usage/linter) |
| `.sh` `.bash`                           | [shellcheck](https://www.shellcheck.net/)        |
| `.yml` `.yaml`                          | [yamllint](https://yamllint.readthedocs.io/)     |

A missing linter is a silent skip (the `command -v` check bails cleanly), so anything you do not install is a no-op. A lint failure exits 2, so Claude sees the errors and can fix them. The 5s timeout in `settings.json` caps runtime.

## Installing the linters

The hook calls each binary directly (no `npx`-fetched fallback). Install whichever you want active.

macOS (Homebrew):

```sh
brew install ruff shellcheck yamllint
npm install -g oxlint
```

Debian / Ubuntu:

```sh
apt install -y shellcheck yamllint
uv tool install ruff # apt's ruff lags; uv tracks upstream
npm install -g oxlint
```

`ruff` via `uv tool install` on Debian/Ubuntu keeps it isolated from system Python and tracks the current release, whereas `apt install ruff` works on recent distros but ships an older build. `oxlint` is zero-config: it ships a full recommended ruleset built in and lints JS/TS/JSX standalone with no project-level config, so configless projects lint cleanly instead of erroring the way flat-config eslint does. A project `.oxlintrc.json` is still picked up from the file's directory if present.
