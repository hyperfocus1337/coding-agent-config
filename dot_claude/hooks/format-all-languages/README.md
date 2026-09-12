# format-all-languages

A `PostToolUse` hook that formats files with [Prettier](https://prettier.io/) after Claude changes them, dispatching by extension. This is the single source of truth for the design notes the hook script only points at; `hook.sh` keeps its inline comments short and references the sections below by name.

## Triggers

The hook is wired to two matchers in `settings.json`, and behaves differently depending on which fired. It tells them apart by whether the tool payload carries `tool_input.file_path`.

### Write / Edit / MultiEdit (single file)

The payload names exactly one file in `tool_input.file_path`. The hook formats that one file if its extension is one Prettier handles natively (see the extension table).

### Bash (markdown sweep)

A Bash tool call carries no `file_path`, but a shell command (`sed`, `perl`, `echo`, a redirect) may still have rewritten files, most importantly markdown, whose tables would then sit misaligned until the next Edit touched them. So on the Bash matcher the hook sweeps the git working tree instead: every markdown file changed versus `HEAD` (`git diff --name-only --diff-filter=d HEAD`) plus untracked markdown (`git ls-files --others --exclude-standard`), and re-formats each.

The sweep is deliberately **markdown-only**. The edit path formats every supported extension because the edit is the point; the Bash path does not, because reformatting every changed `.ts`/`.css`/`.json` on _every_ shell command would fight edits still in progress. Markdown table drift is the specific problem worth a repo-wide pass; the rest is not.

#### Markdown the command names

The sweep asks git what changed, so anything git does not report is invisible. `git ls-files --others --exclude-standard` honours `.gitignore`, and hooks run after the whole command finishes: a call that writes `docs/refactor.md` and adds it to `.gitignore` in one go leaves a file that git already refuses to list. `git ls-files --others` shows it, `--exclude-standard` does not.

So before any git question is asked, the sweep takes every `.md`/`.markdown` path the command text names, absolute or relative to the session cwd, and formats those directly. A file the command names outright is a file being authored now, which is why it gets the pass the rest of the ignored tree does not. Paths that do not resolve to a file drop out on the existing `-f` check, and a named file formats even when the cwd is in no repo at all.

Relative paths are resolved against the session cwd, so a `cd` elsewhere in the command can resolve one wrong. The `-f` check makes that a silent miss, or at worst a no-op pass over an already formatted file of the same name.

This is the same failure as [Write and commit in one command](#write-and-commit-in-one-command) from the other side: there git had already been told the file is clean, here git has been told to ignore it. Naming the file removes git from the question.

[`format-org-tables`](../format-org-tables/README.md) reads the command text the same way, for `.org` paths, and stops there: no git sweep. An Org file is written by a command that names it, so the sweep buys that hook nothing the name does not already give it.

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

#### Write and commit in one command

A single Bash call can write a file, commit it, and push it (`cat > README.md <<'EOF' ... && git commit -am docs && git push`). By the time the hook runs the tree is clean, so the working-tree sweep finds zero candidates and exits, and the unformatted table is already in the pushed commit.

So when the command text contains `git commit`, each root also contributes the files of the last commit (`git diff --name-only --diff-filter=d HEAD~1 HEAD`). A repo with a single commit has no `HEAD~1`; that git call fails silently and the working-tree sources still apply.

Formatting those files fixes the file, not the commit: the commit still holds the unformatted version, and the working tree is now dirty. Only Claude can amend, so the hook says so, through `hookSpecificOutput.additionalContext` naming the files it reformatted. The hint is emitted only when a file the command committed actually changed.

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

Markdown is formatted in a **separate Prettier invocation** from the other languages, with `--print-width 1000`. This is the non-obvious part, and the reason the code splits `targets` into `md_targets` and `other_targets`.

Prettier normally pads table columns to equal width, which is what makes tables human-readable. But under `--prose-wrap never` it stops padding any table wider than `printWidth` (default `80`) and collapses it to the compact `| --- |` form instead, because padding it would produce lines longer than the width it was told never to wrap. The result: narrow tables aligned, wide tables not.

`printWidth` does **not** re-wrap prose when `--prose-wrap never` is set (prose stays one line regardless of width), so raising it only changes the table-compaction threshold. Formatting markdown at `--print-width 1000` therefore keeps wide tables column-aligned while leaving prose single-line.

`printWidth` is a global Prettier option, so it cannot be raised for markdown without also raising it for code, where an 80 column limit is wanted. Hence the split: markdown runs at `--print-width 1000`, every other language runs at Prettier's default `80`.

Ceiling: tables wider than 1000 columns still collapse. Bump the number if that ever bites; it is marked with a `ponytail:` comment in `hook.sh`. It bit once at 400: a 430-column function table in `chezmoi/dot_config/fish/README.md` compacted, which is what raised the number to 1000.

## Never blocks Claude

Unlike `lint-all-languages`, this hook always exits `0`. A missing Prettier (the `command -v prettier` check bails cleanly), a parse error, or any other failure is swallowed, leaving the file untouched. A formatter should reshape working code, not reject an edit. If `jq` is missing the hook self-disables the same way. The `timeout` values in `settings.json` (10s on the edit matcher, 20s on the Bash matcher, which may format several files) cap runtime.

## Installing Prettier

The hook calls the `prettier` binary directly (like `lint-all-languages` calls its linters), so any Prettier on `PATH` works, global, yarn-global, or a project `node_modules/.bin` on `PATH`. It never triggers a network install. Install it whichever way suits you:

```sh
pnpm install -g prettier
```

A per-project `.prettierrc` in the file's directory tree is picked up automatically, so project style wins over Prettier defaults. Note that a `printWidth` set in a project `.prettierrc` overrides the `--print-width 1000` above for markdown in that project.

## Prettier's own ignore rules

Prettier 3 defaults `--ignore-path` to `.gitignore` **and** `.prettierignore`, so a gitignored file is skipped, silently and with exit `0`. That is a second blind spot behind the one in [Markdown the command names](#markdown-the-command-names): handing the file to Prettier is not enough, because Prettier refuses it for the same reason the sweep missed it.

So the hook passes `--ignore-path .prettierignore`, which drops `.gitignore` from that list and keeps `.prettierignore`. `.prettierignore` is a formatting decision and is honoured; `.gitignore` is a version-control decision and says nothing about formatting. Prettier still skips `node_modules` on its own, without `--with-node-modules`.

Both paths are resolved against the hook's process cwd, which is the session cwd, so a `.prettierignore` in another repo does not apply to a cross-repo edit. That was already true of Prettier's default lookup.
