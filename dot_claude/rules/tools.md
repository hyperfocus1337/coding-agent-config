## Tools

**Scope:**

Which tool to use for search, code edits, documentation, and package work.

**Search rules:**

- Text or a pattern: `rg`. Files by name: `fd`. Use these instead of the Grep and Glob tools.
- Code navigation: LSP, for definitions, references, symbols, and call hierarchy.
- A code structure rather than a string: ast-grep, through the `/ast-grep` skill.

**Edit rules:**

- Before you rename a symbol or change a signature, run `findReferences` and fix every call site.
- After you write or edit code, check LSP diagnostics. Fix type errors and missing imports before you move on.

**Documentation rules:**

- Before you generate code, configuration, or setup steps, resolve the library id with Context7 and fetch the documentation. Do not wait to be asked. "Use c7" means the Context7 MCP server.
- Do not read a PDF or other binary document directly. Tell the user to run `/markitdown <file>`, then read the Markdown output that it writes to the scratchpad directory. For a scanned PDF on an Apple Silicon Mac, tell the user to run `/unlimited-ocr <file>` instead.
- The scratchpad directory is `/tmp/agent-scratch`. Create it with `mkdir -p` before the first write. Use it only for files that you alone read: the system deletes temporary files, so a file the user keeps goes next to its source. Other sessions share the directory, so name each file after its source.

**Package and CLI rules:**

- Use `pnpm` for Node package work, never `npm` or `yarn`. The `enforce-cli-tools` hook blocks both, so reaching for them costs a turn.
- Prefer these preinstalled tools over slower equivalents:
  - JSON and YAML: `jq`, `yq`
  - CSV: `mlr`, `csvkit`
  - HTTP requests: `http`
  - Shell linting: `shellcheck`
  - File sync: `rsync`
  - Pipelines: `sponge`, `ts`
  - Processes and sockets: `lsof`, `strace`, `socat`, `nc`
