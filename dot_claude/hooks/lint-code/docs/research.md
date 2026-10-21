# lint-code research

## Tool choices

- **oxlint for JavaScript and TypeScript:** oxlint needs no config. It has a full recommended rule set built in and lints JS, TS, and JSX with no project config. So a project without a config lints cleanly, and does not give an error as eslint does with its flat config.
- **ruff from `uv` on Debian and Ubuntu:** `uv tool install ruff` keeps ruff apart from the system Python and installs the current release. `apt install ruff` works on recent distributions, but it ships an older build.

## Timings

[`docs/hooks/performance/`](../../../../docs/hooks/performance/README.md) gives the time that `lint-code` takes for each call, in process and through `command.ts`.
