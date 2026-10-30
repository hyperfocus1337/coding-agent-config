# Implementation

## Integration

`index.ts` registers a `session_start` handler. In TUI mode it finds the Git root, reads the optional user configuration through `getAgentDir()`, validates directories, and resolves a managed or system `fd` executable. Non-interactive modes and `PI_FILE_SEARCH=0` return before filesystem discovery or subprocess work.

`ctx.ui.addAutocompleteProvider()` wraps the existing provider. Each additional root has a native `CombinedAutocompleteProvider`, so Pi retains ownership of token parsing, filename/path matching, ignore rules, process cancellation, and per-search result limits. The existing provider still handles commands and applies every selected completion. No custom editor, prompt rewriting, model calls, index, watchers, or dependencies are added.

The wrapper uses the native result prefix to decide whether to extend an unqualified `@` query. It never implements a second token parser. If the local provider has no result, a broader provider can supply the prefix and matches. Explicit-path queries with no local results can run redundant native searches before the wrapper discards those results; their search and insertion behaviour is unchanged.

The outer provider wrapper in `index.ts` displays each `@` result as a single path label without a description column. Pi's native select list otherwise clips the filename to a narrow primary column while repeating the path in the description. A single column uses the available menu width. The wrapper preserves each completion value and directory-label trailing slash, so insertion and directory navigation remain native. Commands and ordinary-path menus are unchanged.

## Paths and ranking

`search.ts` validates extra roots, resolves directory aliases, and deduplicates roots. For each match it resolves the actual target, drops missing targets, removes duplicates, and rejects additional-root matches whose symlinks lead outside that root. Root paths come only from Git or user configuration, not from project-owned executable configuration.

Repository matches become paths relative to the session working folder. Other roots produce `~/` paths where possible or absolute paths. The wrapper retains native quote decisions, quotes other non-simple paths after rebasing, and marks directories with a trailing slash so native insertion keeps them open for further completion.

Candidates rank by exact basename, basename prefix, then basename substring. Working-folder results win ties, followed by relative path depth and lexical path order. The merged list contains at most 20 entries. Native providers already bound their candidate lists, so ranking applies to returned candidates rather than every file in a large repository. The extension does not promise full fuzzy subsequence matching.

## Failure and lifecycle

A malformed extra-root configuration does not disable the Git root. Missing configured folders warn once at session startup. A failed provider does not remove local results. Searches share Pi's abort signal; cancelled results are discarded. Native providers close their own search subprocesses, so the extension owns no session resources to release.

Roots and configuration are discovered at session startup, including after `/reload` or session replacement. There is no working-directory mutation. User configuration remains outside chezmoi's source tree unless the user chooses to track it later.

## Validation

`test/check.ts` imports the installed native provider and uses the installed extension loader to load `index.ts`. Temporary repositories cover nested sessions, identical filenames, overlapping roots, spaces, quoted prompts, Unicode, `.gitignore`, `.git`, symlink escape, exact-match ranking, directory insertion, cancellation, missing folders, malformed configuration, a failing provider, result limits, non-TUI mode, and the off switch.

The repository's `scripts/extensions/pi/check.sh` type-checks all extension entry points against the installed Pi and TUI declarations, then runs each extension's self-check. Loader checks use a temporary copy of the extension and modify only temporary configuration, not the source or installed configuration.

The checks also render a long filename through Pi's native select list, verify narrow-terminal display width, and verify unchanged insertion and directory navigation after menu formatting. An interactive visual check is still needed after `/reload` to confirm the menu in the user's terminal.
