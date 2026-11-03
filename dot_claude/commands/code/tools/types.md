---
description: Type-check TypeScript and Python projects across the repository without fixes.
disable-model-invocation: true
---

Run repository type checks in check mode. Arguments: $ARGUMENTS

Read and follow `~/.claude/commands/code/tools/shared.txt`. Accept no arguments; if arguments are supplied, show usage and stop.

Use the tools and configuration of the installed `type-check-tsc` and `type-check-pyrefly` hooks, but check every project, not only projects with changed files.

1. Find TypeScript and Python projects from the eligible files, workspace definitions, and type-check configuration, including configured nested projects. Use each project's existing environment.
2. Run `tsc --noEmit` once in each TypeScript project that has a tsconfig. For project references, use the project's no-emit workflow, not an emitting build. Keep incremental build metadata out of the repository with flags or an external temporary path.
3. Run `pyrefly check` from each Python project root. `No Python files matched` is a skip, not a pass. Do not create a configuration or run `pyrefly init`.
4. Give a file count only if the checker shows it.

For Python import errors, report the configuration, import roots, and environment that Pyrefly used.
