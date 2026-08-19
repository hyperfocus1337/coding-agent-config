# format-all-languages

A `PostToolUse` hook that formats files with [Prettier](https://prettier.io/) after Claude changes them, dispatching by extension. This is the single source of truth for the design notes the hook script only points at; `hook.sh` keeps its inline comments short and references the sections below by name.

## Triggers

The hook is wired to two matchers in `settings.json`, and behaves differently depending on which fired. It tells them apart by whether the tool payload carries `tool_input.file_path`.

### Write / Edit / MultiEdit (single file)

The payload names exactly one file in `tool_input.file_path`. The hook formats that one file if its extension is one Prettier handles natively (see the extension table). It runs after nothing else formatting-related and before `stage-edited-file`, so the staged copy already carries the formatting.

### Bash (markdown sweep)

A Bash tool call carries no `file_path`, but a shell command (`sed`, `perl`, `echo`, a redirect) may still have rewritten files, most importantly markdown, whose tables would then sit misaligned until the next Edit touched them. So on the Bash matcher the hook sweeps the git working tree instead: every markdown file changed versus `HEAD` (`git diff --name-only --diff-filter=d HEAD`) plus untracked markdown (`git ls-files --others --exclude-standard`), and re-formats each.

The sweep is deliberately **markdown-only**. The edit path formats every supported extension because the edit is the point; the Bash path does not, because reformatting every changed `.ts`/`.css`/`.json` on _every_ shell command would fight edits still in progress. Markdown table drift is the specific problem worth a repo-wide pass; the rest is not.

#### Cross-repo Bash edits

The hook's cwd is the session cwd; a `cd` inside the shell command does not move it. So a command that writes markdown in a _different_ repo (`cd /other/repo && cat > UPGRADING.md <<'EOF'`) used to be invisible: the sweep was scoped to the session repo's toplevel only, and the file stayed unformatted until something else touched it.

So the sweep collects roots instead of assuming one: the session cwd, plus every absolute path named in `tool_input.command` (a directory as-is, a file by its parent). Each is resolved to its git toplevel, deduped, and swept. Non-repo paths and paths that do not exist drop out silently, and a command that names no absolute path behaves exactly as before.

Only **absolute** paths are followed. A relative path in the command is ambiguous after an arbitrary `cd`, and guessing wrong would sweep the wrong repo. So a cross-repo edit reached by a relative `cd ../other-repo` is still missed; use an absolute path, or make the edit through Write/Edit. The trade-off is marked with a `ponytail:` comment in `hook.sh`.

#### Nested repos and submodules

A git repo inside a repo is opaque to the parent, so the parent sweep cannot see its markdown. An embedded repo appears in `git ls-files --others` as one bare `nested/` entry, never as the files inside it; a submodule appears in `git diff HEAD` as a gitlink path. Both are directories, so the file filter dropped them and the inner markdown stayed unformatted.

A worktree checked out inside the repo (`git worktree add .worktrees/feat`) is the same case, and the most common one here: the parent lists `.worktrees/feat/` as one entry, because the worktree directory holds a `.git` file rather than tracked content. `git rev-parse --show-toplevel` inside it returns the worktree path, not the main repo, so the worktree becomes a root of its own and its changed and untracked markdown is swept there.

So the roots are a queue, not a fixed list. The sweep loop enumerates one root, sends file entries to the candidate list and directory entries back onto the queue as roots of their own, and continues until the queue is drained. Any nesting depth is covered, and the membership check on push keeps a symlink that points back at an existing root from looping. `test/test.sh` covers a plain subdirectory, an embedded repo, an embedded repo two levels down, and a dirty submodule.

Note the side effect: any repo whose absolute path appears in a shell command gets its changed and untracked markdown formatted, even if the command only read from it. That is the same pass the session repo already gets, and it only ever touches files git already reports as modified or untracked.

Git failures (not a repo, no commits so no `HEAD`) are swallowed with `stderr` silenced, so "not a git repository" never leaks as hook noise; the sweep just finds nothing and exits clean.

## Supported extensions

| Extension                  | Parser     |
| -------------------------- | ---------- |
| `.md` `.markdown`          | markdown   |
| `.js` `.jsx` `.mjs` `.cjs` | babel      |
| `.ts` `.tsx`               | typescript |
| `.json`                    | json       |
| `.css` `.scss`             | css / scss |
| `.html`                    | html       |
| `.yml` `.yaml`             | yaml       |

Any other extension is a clean skip, so the hook never invokes Prettier for files it does not cover. `.org` is covered by a separate hook, [`format-org-tables`](../format-org-tables/README.md), because Prettier has no Org parser. On the Bash sweep the filter is narrowed further to `.md`/`.markdown` only, per the reasoning above.

## Prose wrapping

Everything is formatted with `--prose-wrap never`, so prose stays on a single line and relies on the editor's soft wrap (this matches the repo's "do not hard-wrap prose" rule). It affects markdown/MDX paragraphs and YAML block scalars (`>` and `|`); it has no effect on JSON, JS, TS, or CSS.

## Markdown gets its own pass (wide-table alignment)

Markdown is formatted in a **separate Prettier invocation** from the other languages, with `--print-width 400`. This is the non-obvious part, and the reason the code splits `targets` into `md_targets` and `other_targets`.

Prettier normally pads table columns to equal width, which is what makes tables human-readable. But under `--prose-wrap never` it stops padding any table wider than `printWidth` (default `80`) and collapses it to the compact `| --- |` form instead, because padding it would produce lines longer than the width it was told never to wrap. The result: narrow tables aligned, wide tables not.

`printWidth` does **not** re-wrap prose when `--prose-wrap never` is set (prose stays one line regardless of width), so raising it only changes the table-compaction threshold. Formatting markdown at `--print-width 400` therefore keeps wide tables column-aligned while leaving prose single-line.

`printWidth` is a global Prettier option, so it cannot be raised for markdown without also raising it for code, where an 80 column limit is wanted. Hence the split: markdown runs at `--print-width 400`, every other language runs at Prettier's default `80`.

Ceiling: tables wider than 400 columns still collapse. Bump the number if that ever bites; it is marked with a `ponytail:` comment in `hook.sh`.

## Never blocks Claude

Unlike `lint-all-languages`, this hook always exits `0`. A missing Prettier (the `command -v prettier` check bails cleanly), a parse error, or any other failure is swallowed, leaving the file untouched. A formatter should reshape working code, not reject an edit. If `jq` is missing the hook self-disables the same way. The `timeout` values in `settings.json` (10s on the edit matcher, 20s on the Bash matcher, which may format several files) cap runtime.

## Installing Prettier

The hook calls the `prettier` binary directly (like `lint-all-languages` calls its linters), so any Prettier on `PATH` works, global, yarn-global, or a project `node_modules/.bin` on `PATH`. It never triggers a network install. Install it whichever way suits you:

```sh
npm install -g prettier
```

A per-project `.prettierrc` (and `.prettierignore`) in the file's directory tree is picked up automatically, so project style wins over Prettier defaults. Note that a `printWidth` set in a project `.prettierrc` overrides the `--print-width 400` above for markdown in that project.
