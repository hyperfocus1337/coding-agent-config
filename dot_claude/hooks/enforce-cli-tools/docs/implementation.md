# enforce-cli-tools implementation

This file holds the internals of the hook. For what the hook does and how to use it, see the [README](../README.md).

## Files

| File                                    | Deployed to `~/.claude/hooks/enforce-cli-tools/` | Role                                                                                     |
| --------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `core.ts`                               | Yes                                              | Matcher and block message. No I/O.                                                       |
| `hooks/register.ts`, `hooks/hooks.json` | Yes                                              | Claude Code mod                                                                          |
| `dot_claude-plugin/plugin.json`         | Yes, as `.claude-plugin/plugin.json`             | Plugin manifest                                                                          |
| `pi.ts`                                 | Yes                                              | pi and omp extension                                                                     |
| `command.ts`                            | Yes                                              | Codex command hook                                                                       |
| `io.ts`                                 | Yes                                              | Node reads of `rules`, the allowlist file and the variable, for `pi.ts` and `command.ts` |
| `rules`                                 | Yes                                              | The rules table                                                                          |
| `README.md`, `docs/`, `test/`           | No                                               | Kept in the repo by `.chezmoiignore`                                                     |

## The order of the passes

The matcher in `core.ts` reads the command line in three passes:

1. It drops the body of each heredoc with a quoted delimiter.
2. It blanks quoted spans, so a separator in a string cannot split the command.
3. It splits the rest into segments on `&`, `|`, `;`, newlines, and the brackets that open a subshell, a group or a substitution.

The heredoc pass must come before the quote pass. Else an apostrophe in the heredoc text pairs with a quote lines away, and the quote pass blanks the wrong span.

## Why a hook and not a permissions rule

`settings.json` can deny commands directly (`"permissions": {"deny": ["Bash(npm:*)"]}`), and its matcher uses a real parser. This hook exists because a deny rule can only refuse:

- It cannot name the replacement or suggest a corrected command.
- It cannot be exempted for one repo: deny always wins over allow, so nothing can do what `.agent-allow-cli-tools` does.
- pi, omp and Codex do not read it.

If those three points stop mattering, a deny rule plus the line in `rules/tools.md` replaces this directory.
