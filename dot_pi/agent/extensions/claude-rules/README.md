# claude-rules

Loads `~/.claude/rules/**/*.md` and approved `<cwd>/.claude/rules/**/*.md`: a rule without `paths:` is in the system prompt from the first turn, and a rule with `paths:` reaches the model once, after a file that matches one of its globs is read, written, or edited.

## Unscoped rules

Every rule file with no `paths:` frontmatter is added to pi's structured `contextFiles` in file-name order, with its absolute path and body. User and approved project rules are both retained, including rules with the same filename. Existing instruction files are preserved, and a path already present is not added twice. Rule contents are read at session start and stay stable between turns; `/reload` picks up edits. `README.md` is documentation, not a rule.

Pi renders these records in its `project_context` section. `pi-context-view` can therefore list each rule under **Instruction Files**, rather than treat the bodies as extension prompt additions. After applying this change, run `/reload` and `/context`; if the viewer still shows an older captured request, send a new prompt and open `/context` again. Path-scoped rules remain conditional messages and do not appear in the initial instruction-file list.

## Project approval

The [claude-project coordinator](../claude-project/README.md) owns project approval and sends the approved `.claude` directory over pi's shared event bus. Keep the coordinator installed for local rules; the commands and skills extensions do not need to be enabled. See [project resources](../claude-commands/README.md#project-resources) for trust decisions, working-directory scope, and reload instructions.

## Scoped rules

A rule with `paths:` is sent after the `read`, `write`, or `edit` tool succeeds on a file inside the project whose path, relative to the session directory, matches one of the globs. It is sent once per rule per session, lands before the next model call, and persists in the session, so a resumed or forked session does not receive it again. Project rules use their absolute file paths as persisted identities, so a user rule with the same filename does not suppress a project rule. The TUI prints `Loaded rule <name> for <path>` when it fires. A file outside the project matches nothing.

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

- `@import` expansion inside a rule and `claudeMdExcludes`: no rule here uses them.
- Realpath comparison for symlinked checkouts and managed settings.

## Checks

`node test/check.ts` from this directory, or `just pi-check` for the type check as well. The checks cover `paths:` parsing, every row of the glob table, a path outside the project, discovery on a fixture tree, stable instruction-file records, preservation of native files, duplicate prevention, scoped-rule exclusion, approval denial, and the installed rule bodies. With `PI_PACKAGE` set, they also check pi's native rendering and, when `pi-context-view` is installed, its Instruction Files classification.

For where the two injection points sit in pi's event model and why the globs need no dependency, see [docs/implementation.md](docs/implementation.md).
