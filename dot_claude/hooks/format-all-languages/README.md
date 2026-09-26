# format-all-languages

A `PostToolUse` and `PostToolUseFailure` hook that formats files with [Prettier](https://prettier.io/) after Claude changes them, dispatching by extension. This is the single source of truth for the design notes the hook script only points at; `hook.sh` keeps its inline comments short and references the sections below by name. For why the hook fires on the events it does, and which other events were considered and rejected, see [docs/implementation.md](docs/implementation.md).

## Triggers

The hook is wired to three entries in `settings.json`: `Write|Edit|MultiEdit` and `Bash` on `PostToolUse`, and `Bash` again on `PostToolUseFailure`. It behaves differently depending on which fired, and tells them apart by whether the tool payload carries `tool_input.file_path`. [Why PostToolUse, and not Stop](docs/implementation.md#why-posttooluse-and-not-stop) says why the turn-level events are wrong for a formatter.

### Write / Edit / MultiEdit (single file)

The payload names exactly one file in `tool_input.file_path`. The hook formats that one file if its extension is one Prettier handles natively (see the extension table).

### Bash (markdown sweep)

A Bash tool call carries no `file_path`, but a shell command (`sed`, `perl`, `echo`, a redirect) may still have rewritten files, most importantly markdown, whose tables would then sit misaligned until the next Edit touched them. So on the Bash matcher the hook sweeps the git working tree instead: every markdown file changed versus `HEAD` (`git diff --name-only --diff-filter=d HEAD`) plus untracked markdown (`git ls-files --others --exclude-standard`), and re-formats each.

The sweep is deliberately **markdown-only**. The edit path formats every supported extension because the edit is the point; the Bash path does not, because reformatting every changed `.ts`/`.css`/`.json` on _every_ shell command would fight edits still in progress. Markdown table drift is the specific problem worth a repo-wide pass; the rest is not.

The cost of that choice is that a non-markdown file written by a shell command stays unformatted until an `Edit` touches it. [The gap the current wiring leaves](docs/implementation.md#the-gap-the-current-wiring-leaves) records when that matters and what would close it.

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

#### A Bash command that writes a file and then fails

`PostToolUse` fires only after a tool call **succeeds**. A shell command that exits non-zero raises `PostToolUseFailure` instead, which is a separate event with its own wiring. That misses the write-then-verify pattern, which is most of what a shell command does: `cat > notes.md <<'EOF' ... EOF && just fmt-check` writes the file, fails the check, and the format pass never ran.

Measured on 2026-09-19 with two Bash calls writing the same unaligned table, differing only in the exit code: the exit 0 file came back column-aligned, the exit 1 file was untouched. So the Bash matcher is wired to both events, and the hook code is identical on each: the payload carries `tool_input.command` either way.

One detail the code does care about. The amend hint below reports through `hookSpecificOutput`, whose `hookEventName` is the discriminant of a per-event schema. A `PostToolUse` literal sent from a `PostToolUseFailure` run does not match that schema, so the hook reads `.hook_event_name` off the payload and echoes it back rather than hardcoding it.

`PostToolUseFailure` also carries `is_interrupt`, so the sweep runs after you interrupt a shell command as well. That is wanted: an interrupted command can leave a half-written file, and Prettier is safe to run on one.

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

## Throwaway files

A path under `/tmp`, `/var/tmp` or `$TMPDIR` is skipped on both matchers: Claude's scratchpad lives there, and a file it is about to throw away is not project code. macOS resolves `/tmp` to `/private/tmp` and `$TMPDIR` to `/private/var/folders/...`, and the path a payload carries holds that prefix while `$TMPDIR` does not, so both sides of the comparison drop a leading `/private`. [`lint-all-languages`](../lint-all-languages/README.md) and [`format-org-tables`](../format-org-tables/README.md) skip the same paths.

## Prose wrapping

Everything is formatted with `--prose-wrap preserve`, so Prettier keeps the line breaks the author wrote. This supports the rule in `writing.md`: one sentence per line in documentation files. It affects markdown/MDX paragraphs and YAML block scalars (`>` and `|`); it has no effect on JSON, JS, TS, or CSS.

`--prose-wrap never` would join the lines of each paragraph into one line. It also stops Prettier from padding a table wider than `printWidth` (default `80`): the table collapses to the compact `| --- |` form. Under `preserve`, Prettier pads every table, so markdown and code run in one pass at the default width.

## Never blocks Claude

Unlike `lint-all-languages`, this hook always exits `0`. A missing Prettier (the `command -v prettier` check bails cleanly), a parse error, or any other failure is swallowed, leaving the file untouched. A formatter should reshape working code, not reject an edit. If `jq` is missing the hook self-disables the same way. The `timeout` values in `settings.json` (10s on the edit matcher, 20s on each Bash matcher, which may format several files) cap runtime.

## Installing Prettier

The hook calls the `prettier` binary directly (like `lint-all-languages` calls its linters), so any Prettier on `PATH` works, global, yarn-global, or a project `node_modules/.bin` on `PATH`. It never triggers a network install. Install it whichever way suits you:

```sh
pnpm install -g prettier
```

A per-project `.prettierrc` in the file's directory tree is picked up automatically, so project style wins over Prettier defaults. Note that a `proseWrap` set in a project `.prettierrc` does not override the `--prose-wrap preserve` above, because a command-line option wins.

## Prettier's own ignore rules

Prettier 3 defaults `--ignore-path` to `.gitignore` **and** `.prettierignore`, so a gitignored file is skipped, silently and with exit `0`. That is a second blind spot behind the one in [Markdown the command names](#markdown-the-command-names): handing the file to Prettier is not enough, because Prettier refuses it for the same reason the sweep missed it.

So the hook passes `--ignore-path .prettierignore`, which drops `.gitignore` from that list and keeps `.prettierignore`. `.prettierignore` is a formatting decision and is honoured; `.gitignore` is a version-control decision and says nothing about formatting. Prettier still skips `node_modules` on its own, without `--with-node-modules`.

Both paths are resolved against the hook's process cwd, which is the session cwd, so a `.prettierignore` in another repo does not apply to a cross-repo edit. That was already true of Prettier's default lookup.
