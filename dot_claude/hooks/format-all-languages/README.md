# format-all-languages

A `PostToolUse` hook that formats files with [Prettier](https://prettier.io/) after Claude changes them, dispatching by extension. This is the single source of truth for the design notes the hook script only points at; `hook.sh` keeps its inline comments short and references the sections below by name.

## Triggers

The hook is wired to two matchers in `settings.json`, and behaves differently depending on which fired. It tells them apart by whether the tool payload carries `tool_input.file_path`.

### Write / Edit / MultiEdit (single file)

The payload names exactly one file in `tool_input.file_path`. The hook formats that one file if its extension is one Prettier handles natively (see the extension table). It runs after nothing else formatting-related and before `stage-edited-file`, so the staged copy already carries the formatting.

### Bash (markdown sweep)

A Bash tool call carries no `file_path`, but a shell command (`sed`, `perl`, `echo`, a redirect) may still have rewritten files, most importantly markdown, whose tables would then sit misaligned until the next Edit touched them. So on the Bash matcher the hook sweeps the git working tree instead: every markdown file changed versus `HEAD` (`git diff --name-only --diff-filter=d HEAD`) plus untracked markdown (`git ls-files --others --exclude-standard`), and re-formats each.

The sweep is deliberately **markdown-only**. The edit path formats every supported extension because the edit is the point; the Bash path does not, because reformatting every changed `.ts`/`.css`/`.json` on _every_ shell command would fight edits still in progress. Markdown table drift is the specific problem worth a repo-wide pass; the rest is not.

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

Any other extension is a clean skip, so the hook never spawns `npx` for files Prettier does not cover. On the Bash sweep the filter is narrowed further to `.md`/`.markdown` only, per the reasoning above.

## Prose wrapping

Everything is formatted with `--prose-wrap never`, so prose stays on a single line and relies on the editor's soft wrap (this matches the repo's "do not hard-wrap prose" rule). It affects markdown/MDX paragraphs and YAML block scalars (`>` and `|`); it has no effect on JSON, JS, TS, or CSS.

## Markdown gets its own pass (wide-table alignment)

Markdown is formatted in a **separate Prettier invocation** from the other languages, with `--print-width 400`. This is the non-obvious part, and the reason the code splits `targets` into `md_targets` and `other_targets`.

Prettier normally pads table columns to equal width, which is what makes tables human-readable. But under `--prose-wrap never` it stops padding any table wider than `printWidth` (default `80`) and collapses it to the compact `| --- |` form instead, because padding it would produce lines longer than the width it was told never to wrap. The result: narrow tables aligned, wide tables not.

`printWidth` does **not** re-wrap prose when `--prose-wrap never` is set (prose stays one line regardless of width), so raising it only changes the table-compaction threshold. Formatting markdown at `--print-width 400` therefore keeps wide tables column-aligned while leaving prose single-line.

`printWidth` is a global Prettier option, so it cannot be raised for markdown without also raising it for code, where an 80 column limit is wanted. Hence the split: markdown runs at `--print-width 400`, every other language runs at Prettier's default `80`.

Ceiling: tables wider than 400 columns still collapse. Bump the number if that ever bites; it is marked with a `ponytail:` comment in `hook.sh`.

## Never blocks Claude

Unlike `lint-all-languages`, this hook always exits `0`. A missing Prettier, a parse error, or any other failure is swallowed, leaving the file untouched. A formatter should reshape working code, not reject an edit. If `jq` is missing the hook self-disables the same way. The `timeout` values in `settings.json` (10s on the edit matcher, 20s on the Bash matcher, which may format several files) cap runtime.

## Installing Prettier

The hook runs `npx --no-install prettier`, so it uses a global or project-local Prettier but never triggers a network install. Install whichever suits you:

```sh
npm install -g prettier
```

A per-project `.prettierrc` (and `.prettierignore`) in the file's directory tree is picked up automatically, so project style wins over Prettier defaults. Note that a `printWidth` set in a project `.prettierrc` overrides the `--print-width 400` above for markdown in that project.
