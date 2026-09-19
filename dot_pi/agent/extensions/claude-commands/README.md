# claude-commands

Registers every `~/.claude/commands/**/*.md` file as a pi slash command, named by its path, and expands the body the way Claude Code does before it goes to the model as a user message.

## Names

Directories become `:` segments, so the name matches what Claude Code registers:

| File                       | Command                  |
| -------------------------- | ------------------------ |
| `git/commit/single.md`     | `/git:commit:single`     |
| `git/branches/cleanup.md`  | `/git:branches:cleanup`  |
| `git/worktrees/cleanup.md` | `/git:worktrees:cleanup` |
| `dead-code.md`             | `/dead-code`             |

A `name:` in frontmatter replaces the leaf only, not the path. `README.md` at any level is documentation, not a command. The command list shows `description:` from frontmatter, or the first line of the body when there is none, followed by `argument-hint:` in parentheses.

## Arguments

Everything typed after the command name is the argument string. A quoted run counts as one argument.

| Placeholder     | Expands to                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `$ARGUMENTS`    | the whole string                                                                                                        |
| `$ARGUMENTS[N]` | argument `N`, 0-based, so `$ARGUMENTS[0]` is the first                                                                  |
| `$N`            | shorthand for `$ARGUMENTS[N]`; an index with no argument stays literal                                                  |
| `$name`         | the argument at the position of `name` in the `arguments:` frontmatter list; a name with no argument expands to nothing |
| `\$`            | a literal `$`, so `\$1` is not a placeholder                                                                            |

`arguments:` takes a YAML list or a space-separated string. A name matches on a word boundary only, so write `-v"$hours"H` and not `-v$hoursH`. A name with no argument expanding to nothing means `HEAD~$count` becomes `HEAD~`, which git reads as `HEAD~1`; a command that relies on the count must say so in its body.

When the body reads no placeholder and arguments were typed, `ARGUMENTS: <string>` is appended, as Claude Code does.

## Dynamic context

A `` !`cmd` `` span runs `cmd` through `/bin/sh -c` in the session's working directory and is replaced by its output, stdout then stderr, with trailing whitespace removed. The `!` counts at the start of a line or after whitespace only, so `KEY=!`cmd`stays literal, and a span inside a fenced code block is sample text. Arguments are substituted before spans run, so` !`gh issue view $ARGUMENTS` `` works. Each span has 120 seconds. A span that exits non-zero aborts the command with a notification, because a body whose context block is empty would reach the model looking complete.

## Not carried over

- `allowed-tools`: pi has no permission system, so there is nothing to pre-approve.
- `disable-model-invocation`: pi has no model-facing slash-command tool, so every command is user-invoked already.
- `@file` inlining, `${CLAUDE_*}` variables, and ` ```! ` blocks: no command file uses them.

## Checks

`node test/check.ts` from this directory, or `just pi-check` for the type check as well. The checks cover naming, frontmatter parsing, every placeholder form and escape, span placement and failure, and the installed tree: every name unique, every command described, the colliding basenames all present.

For why the extension registers commands itself instead of using pi's `prompts` setting, and how the expansion is ordered and parsed, see [docs/implementation.md](docs/implementation.md).
