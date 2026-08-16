### Tools

Pick a search by what you are looking for:

- Text or a pattern: `rg`. Files by name: `fd`. Use these instead of the Grep and Glob tools.
- Code navigation: LSP. Definitions, references, symbols, and call hierarchy.
- A code structure rather than a string: ast-grep, through the `/ast-grep` skill.

Run `findReferences` before you rename a symbol or change a signature, and fix every call site.

Check LSP diagnostics after you write or edit code. Fix type errors and missing imports before you move on.

Resolve the library id with Context7 and fetch the documentation before you generate code, configuration, or setup steps. Do not wait to be asked. "Use c7" means the Context7 MCP server.

Use `pnpm` for Node package work, never `npm` or `yarn`. The `enforce-cli-tools` hook blocks both, so reaching for them costs a turn.

Other preinstalled tools, preferred over slower equivalents: `jq` and `yq` for JSON and YAML, `mlr` and `csvkit` for CSV, `http` for HTTP requests, `shellcheck` for shell linting, `rsync` for file sync, `sponge` and `ts` for pipelines, plus `lsof`, `strace`, `socat`, and `nc`.
