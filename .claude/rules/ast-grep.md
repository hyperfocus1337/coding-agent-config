### ast-grep

Use ast-grep (via `/ast-grep` skill) for structural pattern search:

- Finding all usages of a pattern across the codebase (e.g. all `for` loops calling `.append()`)
- Identifying missing annotations, decorators, or structural anti-patterns
- Cross-language searches where LSP has no coverage
- Prefer over Grep when the target is a code structure, not a string
