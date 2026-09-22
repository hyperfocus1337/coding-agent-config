# claude-rules

Loads `~/.claude/rules/**/*.md` the way Claude Code loads user-level rules: a rule without `paths:` is in the system prompt from the first turn, and a rule with `paths:` reaches the model once, after a file that matches one of its globs is read, written, or edited.

## Unscoped rules

Every rule file with no `paths:` frontmatter is appended to the system prompt under one heading, `# Rules from ~/.claude/rules`, in file-name order. The block is built once when pi starts and does not change between turns, so it costs one prompt-cache write per session, not one per turn. `README.md` is documentation, not a rule.

## Scoped rules

A rule with `paths:` is sent after the `read`, `write`, or `edit` tool succeeds on a file inside the project whose path, relative to the session directory, matches one of the globs. It is sent once per rule per session, lands before the next model call, and persists in the session, so a resumed or forked session does not receive it again. The TUI prints `Loaded rule <name> for <path>` when it fires. A file outside the project matches nothing.

`paths:` takes a YAML list or a flow list. Globs follow the semantics Claude Code documents:

| Pattern                | Matches                                              |
| ---------------------- | ---------------------------------------------------- |
| `**/*.ts`              | a `.ts` file in any directory                        |
| `src/**/*`             | everything under `src/`                              |
| `*.md`                 | a `.md` file in the project root only                |
| `src/components/*.tsx` | one directory, no deeper                             |
| `src/**/*.{ts,tsx}`    | braces expand                                        |
| `src/`                 | a trailing slash stands for the directory's contents |

## Not carried over

- Project-scope `.claude/rules/`: the extension reads user scope only.
- `@import` expansion inside a rule and `claudeMdExcludes`: no rule here uses them.
- Realpath comparison for symlinked checkouts and managed settings.

## Checks

`node test/check.ts` from this directory, or `just pi-check` for the type check as well. The checks cover `paths:` parsing, every row of the glob table, a path outside the project, discovery on a fixture tree, block stability, and the installed tree: every installed rule is unscoped, and the three bodies are in the block in full.

For where the two injection points sit in pi's event model and why the globs need no dependency, see [docs/implementation.md](docs/implementation.md).
