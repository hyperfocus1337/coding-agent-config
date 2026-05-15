---
paths:
  - "**"
---

### jcodemunch MCP

Use jcodemunch for codebase orientation and bulk symbol lookup:

- `index_folder` once per project before using other tools (stored in `~/.code-index/`)
- `get_file_tree` / `get_repo_outline` to understand project structure without reading files
- `search_symbols` to find a symbol by name when you don't know its location
- `get_file_outline` to see all symbols in a file without reading its full content
- `search_text` for full-text search as a last resort if LSP and Grep fall short

Tool selection order for code navigation:

1. LSP — semantic lookups (definitions, references, types, call hierarchy)
2. jcodemunch — orientation, symbol discovery, bulk structure overview
3. ast-grep — structural pattern matching across the codebase
4. Grep/Glob — plain text / config / comment searches
