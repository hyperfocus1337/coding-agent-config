# Prompt autocompletion

Claude Code has two pickers in the prompt input: the `@` file picker and the `/` command picker. Both open a list above the input, both accept with Tab or Enter, and both behave differently from shell completion. This doc records what each picker lists, how it ranks, what Tab and Enter do, and which settings change it. The official reference for the keys is the [interactive mode](https://code.claude.com/docs/en/interactive-mode) page; this doc adds the behavior that page leaves out. It exists because Tab on a folder in the `@` picker inserts `@folder/ ` with a trailing space and closes the list, which is the opposite of what shell users expect.

Checked 2026-09-12 against Claude Code 2.1.269 in this repository, with the inline (non-fullscreen) renderer. Behavior was observed in a live session, then confirmed against the CLI's own logic. Version-specific details can change.

## The `@` file picker

### What the list contains

| Source              | Included when                                                         | Notes                                                                                  |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Tracked files       | The working directory is inside a git repository                      | `git ls-files` from the repository root, submodules included, 5 second timeout         |
| Untracked files     | Same                                                                  | Fetched in the background after the tracked list, so they can appear a moment later    |
| All files           | Not a git repository, or `git ls-files` failed                        | ripgrep `--files --hidden --follow`, minus `.git`, `.svn`, `.hg`, `.bzr`, `.jj`, `.sl` |
| Directories         | Always                                                                | Derived from the file list. They appear with a trailing `/`                            |
| Agents              | Query is non-empty                                                    | Rows read `name (agent)`; only when `name` contains the query                          |
| MCP resources       | A connected MCP server exposes resources                              | Rows read `server:uri`; ranked below files with the same match                         |
| Other live sessions | Cross-session messaging is active and at least one letter follows `@` | See [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) |

Filters applied to the file list:

- `.gitignore` patterns are respected when [`respectGitignore`](https://code.claude.com/docs/en/settings-reference#respectgitignore) is `true` (the default). Set it to `false` in any `settings.json` scope, or toggle "Respect .gitignore in file picker" in `/config`, to include ignored files.
- `.ignore` and `.rgignore` files in the repository root and in the working directory are always applied, independent of `respectGitignore`. Use one of these to hide vendored or generated trees from the picker without touching `.gitignore`.
- Paths are shown relative to the working directory, not the repository root.

The index is rebuilt when `.git/index` changes, and at most once every 5 seconds. A file created by a tool call in the current turn shows up after the next rebuild.

### Two matching modes

The shape of the text after `@` selects the mode.

| Query shape                                                      | Mode  | Behavior                                                                                                                |
| ---------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------- |
| Empty (`@` alone)                                                | Fuzzy | Lists the entries of the working directory                                                                              |
| Relative text such as `docs`, `docs/res`, `src/comp/but`         | Fuzzy | Subsequence match against every indexed path; up to 15 results                                                          |
| Starts with `/`, `~/`, `./`, `../`, or is exactly `~`, `.`, `..` | Path  | Lists one directory. Name-prefix match, directories first, then alphabetical, hidden entries excluded, up to 10 results |

Fuzzy mode ranking, in order of weight:

1. Every query character must appear in the path, in order. `dcs` matches `docs/`.
2. Consecutive query characters that sit next to each other in the path score higher than characters with a gap. Each skipped path character costs a little.
3. A match at the start of the path, or right after `/`, `-`, `_`, `.`, a space, or at a camelCase boundary, scores a bonus.
4. Short paths beat long paths. This is why `docs/` outranks `docs/README.md` for the query `docs`, and why a bare directory name lists five directories before any file.
5. Paths that contain `test` are pushed down slightly.
6. The match is case-insensitive unless the query contains an uppercase letter.

Path mode is the only mode that behaves like a shell: it lists one directory at a time and Tab descends into it.

### What Tab, Enter, and the arrows do

Fuzzy mode:

| Key     | Condition                                                        | Result                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab     | All listed rows share a common prefix longer than what you typed | The input extends to that prefix, with no trailing space. Example: `@docs/res` becomes `@docs/research/`. The list usually closes; type one more character to reopen it |
| Tab     | Otherwise                                                        | Inserts the highlighted row plus a space and closes the list. For a directory row this gives `@docs/ `                                                                  |
| Enter   | A row is highlighted                                             | Same as Tab in the second case: inserts the row plus a space. It does not submit the prompt                                                                             |
| Up/Down | Any                                                              | Moves the highlight. The list shows 5 rows at a time and scrolls through all 15 results                                                                                 |
| Esc     | Any                                                              | Closes the list and keeps the text                                                                                                                                      |

Path mode:

| Key | Row type  | Result                                                                                                                                            |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab | Directory | Appends `/`, keeps the list open, and lists the contents of that directory. Example: `@~/Rep` becomes `@~/Repositories/` with its children listed |
| Tab | File      | Inserts the name plus a space and closes the list                                                                                                 |

Caveat for `./`: the `./` prefix is stripped when Tab accepts a row, so `@./docs/` Tab gives `@docs/mcp/` and the next Tab runs in fuzzy mode again. The `~/`, `/`, and `../` prefixes stay in the input, so Tab keeps descending for those.

The trailing space after an accepted `@path` is deliberate: it marks the mention as complete so the next word starts a new token. A path that contains a space is inserted as `@"path with space.md"`.

### Practical use

- To reach a nested file, type fragments of each path segment in one go: `@src/comp/but` finds `src/components/Button.tsx`. There is no need to descend.
- To browse a tree one level at a time, use path mode with a prefix that survives Tab: `@~/Repositories/agents/`, `@/Users/name/project/`, or `@../` from a subdirectory.
- To recover from an accepted directory such as `@docs/ `, press Backspace once and keep typing; the list reopens on the next character.
- To keep noise out of the list, add patterns to a `.ignore` file in the repository root. It applies only to the picker and to ripgrep, not to git.
- To replace the picker's source entirely, set [`fileSuggestion`](https://code.claude.com/docs/en/settings-reference#filesuggestion) in `settings.json`. Claude Code runs the command with the [hook environment](https://code.claude.com/docs/en/hooks) (`CLAUDE_PROJECT_DIR` is set), writes `{"query": "<typed text>"}` to its stdin, waits at most 5 seconds, and shows the first 15 newline-separated paths from stdout. The command runs only after workspace trust is accepted, and only when the built-in list would have been queried. Example: a script that lists the contents of the directory in the query gives shell-style descent for relative paths.

```json
{
  "fileSuggestion": {
    "type": "command",
    "command": "~/.claude/file-suggestion.sh"
  }
}
```

The only rebindable actions are `autocomplete:accept` (Tab), `autocomplete:dismiss` (Esc), `autocomplete:previous` (Up), and `autocomplete:next` (Down) in the `Autocomplete` context of `~/.claude/keybindings.json`, documented under [autocomplete actions](https://code.claude.com/docs/en/keybindings#autocomplete-actions). There is no action for "extend to common prefix" or "descend into directory".

## The `/` command picker

### Trigger and query

- `/` as the first character of the prompt opens the picker. The text up to the first space is the query.
- `/` after a space, later in the prompt, opens a narrower [mid-prompt picker](https://code.claude.com/docs/en/interactive-mode#complete-a-command-mid-prompt). It only matches commands whose full name, display name, or the part after the last `:` starts with the typed letters, so a path such as `/tmp/notes.md` does not keep a list open. Outside [fullscreen](https://code.claude.com/docs/en/fullscreen) the rest of the top match shows as ghost text with a `+N` count when more commands match.
- Some commands complete their arguments: `/add-dir` and `/cd` list directories, `/resume` lists sessions, `/plugin` and `/marketplace` list their subcommands and names.

### Ranking

With an empty query (`/` alone), the list is grouped: up to 5 of your most used [skills](https://code.claude.com/docs/en/skills) first, then [built-in commands](https://code.claude.com/docs/en/commands), then user skills, project skills, managed skills, and plugin skills, each group alphabetical.

With a query, the list is a fuzzy search over these fields, in order of weight: the command name, its display name, its name split into parts on `:`, `_`, and `-`, its aliases, and the words of its description. This is why `/commit` lists `git:commit:multiple`, `git:commit:single`, and the other `git:commit:*` skills: `commit` is a part of each name. The results are then ordered by: exact name match, exact alias match, name prefix match (shorter name first), alias prefix match, fuzzy score, and finally how often you used the command.

A plugin skill also matches on its bare name: `/deploy` finds `myplugin:deploy-app`.

### What Tab and Enter do

| Key                          | Result                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab                          | Inserts the highlighted command as `/name ` with a trailing space. The prompt is not submitted                                                                                                 |
| Enter                        | Inserts the highlighted command. If it is a built-in, or a skill that declares no arguments, it runs at once. If the skill declares arguments, the input stays as `/name ` for you to add them |
| Tab, mid-prompt              | Inserts the single match. With several matches it opens the list; pick a row with the arrows and Enter                                                                                         |
| Tab on a bare mid-prompt `/` | Lists every command                                                                                                                                                                            |

## Shell mode (`!`)

[Shell mode](https://code.claude.com/docs/en/interactive-mode#shell-mode-with-prefix) has its own completion, separate from the two pickers:

- A token that contains `/` opens a path dropdown with the directory's contents, updated as you type. Tab on a directory appends `/` and keeps going.
- Tab on a partial command completes from the `!` history of the current project.
- When `$SHELL` is bash or zsh, Tab also asks that shell for its completions. Other shells, including fish, get only history and path completion.

## Emoji shortcodes

`:` followed by two or more characters opens an [emoji list](https://code.claude.com/docs/en/interactive-mode#emoji-shortcodes); a full `:name:` inserts the emoji directly. Set [`emojiCompletionEnabled`](https://code.claude.com/docs/en/settings-reference#emojicompletionenabled) to `false` in `settings.json` to turn it off.

## Upstream status

- [anthropics/claude-code#92400](https://github.com/anthropics/claude-code/issues/92400) (open) asks for Tab to extend to the longest common prefix in the `@` picker instead of accepting the top row. In 2.1.269 that first step already exists: Tab extends to the common prefix when one is longer than the typed text, and only accepts a row when it is not. What is missing is the shell-style descent for relative paths; path mode has it, fuzzy mode does not.
- [anthropics/claude-code#62579](https://github.com/anthropics/claude-code/issues/62579) ("tab-completion mode similar to bash") was closed as not planned.

## Sources

Official documentation:

- [Interactive mode](https://code.claude.com/docs/en/interactive-mode): keyboard shortcuts, [quick commands](https://code.claude.com/docs/en/interactive-mode#quick-commands), [mid-prompt command completion](https://code.claude.com/docs/en/interactive-mode#complete-a-command-mid-prompt), [shell mode](https://code.claude.com/docs/en/interactive-mode#shell-mode-with-prefix), [emoji shortcodes](https://code.claude.com/docs/en/interactive-mode#emoji-shortcodes)
- [Keybindings](https://code.claude.com/docs/en/keybindings): the `Autocomplete` context and its four actions
- [Settings reference](https://code.claude.com/docs/en/settings-reference): [`fileSuggestion`](https://code.claude.com/docs/en/settings-reference#filesuggestion), [`respectGitignore`](https://code.claude.com/docs/en/settings-reference#respectgitignore), [`emojiCompletionEnabled`](https://code.claude.com/docs/en/settings-reference#emojicompletionenabled)
- [Commands](https://code.claude.com/docs/en/commands) and [Skills](https://code.claude.com/docs/en/skills): what the `/` picker lists
- [Hooks](https://code.claude.com/docs/en/hooks): the environment a `fileSuggestion` command runs with
- [Fullscreen rendering](https://code.claude.com/docs/en/fullscreen): the renderer that changes how the mid-prompt list opens
- [Cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging): why other sessions appear in the `@` list

GitHub:

- [anthropics/claude-code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md): the version history of the completion fixes
- [Issue #92400](https://github.com/anthropics/claude-code/issues/92400): Tab should complete to the longest common prefix in the `@` picker (open)
- [Issue #62579](https://github.com/anthropics/claude-code/issues/62579): tab-completion mode similar to bash (closed, not planned)
- [Issue #87464](https://github.com/anthropics/claude-code/issues/87464): shell-mode path completion drops the `./` prefix (open)

The behavior itself was observed in Claude Code 2.1.269 on 2026-09-12, in a session driven through tmux in this repository.
