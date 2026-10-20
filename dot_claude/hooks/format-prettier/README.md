# format-prettier

Formats the files that a Write, an Edit, or a Bash call changed with [Prettier](https://prettier.io/), by extension. This README holds the design notes, and the comments in [`core.ts`](core.ts) name the sections below. For why the hook runs after each call and not at the end of a turn, see [docs/implementation.md](docs/implementation.md).

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                                                                                                 | Loaded by                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash formats after `next`                                                              | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                    |
| pi          | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash                                                                                                                | `extensions` in `dot_pi/agent/modify_settings.json`                                  |
| omp         | [`pi.ts`](pi.ts) as in pi, and [`omp.ts`](omp.ts): `tool_result` on an omp edit of more than one file, an `ast_edit` that a write to `xd://resolve` applies, and `eval` | `extensions` in `dot_omp/private_agent/private_config.yml`                           |
| Codex       | [`command.ts`](command.ts): the amend hint as `hookSpecificOutput` JSON on stdout                                                                                       | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts` |

The git pre-commit hook [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) also runs `command.ts`, once for each staged file.

## Triggers

The hook runs after each Write, Edit, and Bash call. It tells them apart by whether the call names a file: a Write or an Edit names one in `file_path`, a Bash call names none. [Why PostToolUse, and not Stop](docs/implementation.md#why-posttooluse-and-not-stop) says why the turn-level events are wrong for a formatter.

### Write and Edit (one file)

The call names exactly one file. The hook formats that one file if its extension is one Prettier handles natively (see the extension table).

### Bash (markdown sweep)

A Bash tool call carries no `file_path`, but a shell command (`sed`, `perl`, `echo`, a redirect) may still have rewritten files, most importantly markdown, whose tables would then sit misaligned until the next Edit touched them. So on the Bash matcher the hook sweeps the git working tree instead: every markdown file changed versus `HEAD` (`git diff --name-only --diff-filter=d HEAD`) plus untracked markdown (`git ls-files --others --exclude-standard`), and re-formats each.

The sweep is deliberately **markdown-only**. The edit path formats every supported extension because the edit is the point; the Bash path does not, because reformatting every changed `.ts`/`.css`/`.json` on _every_ shell command would fight edits still in progress. Markdown table drift is the specific problem worth a repo-wide pass; the rest is not.

The cost of that choice is that a non-markdown file written by a shell command stays unformatted until an `Edit` touches it. [The gap the current wiring leaves](docs/implementation.md#the-gap-the-current-wiring-leaves) records when that matters and what would close it.

#### Markdown the command names

The sweep asks git what changed, so anything git does not report is invisible. `git ls-files --others --exclude-standard` honours `.gitignore`, and hooks run after the whole command finishes: a call that writes `docs/refactor.md` and adds it to `.gitignore` in one go leaves a file that git already refuses to list. `git ls-files --others` shows it, `--exclude-standard` does not.

So before any git question is asked, the sweep takes every `.md`/`.markdown` path the command text names, absolute or relative to the session cwd, and formats those directly. A file the command names outright is a file being authored now, which is why it gets the pass the rest of the ignored tree does not. Paths that do not resolve to a file drop out on the file check, and a named file formats even when the cwd is in no repo at all.

Relative paths are resolved against the session cwd, so a `cd` elsewhere in the command can resolve one wrong. The file check makes that a silent miss, or at worst a no-op pass over an already formatted file of the same name.

This is the same failure as [Write and commit in one command](#write-and-commit-in-one-command) from the other side: there git had already been told the file is clean, here git has been told to ignore it. Naming the file removes git from the question.

[`format-org-tables`](../format-org-tables/README.md) reads the command text the same way, for `.org` paths, and stops there: no git sweep. An Org file is written by a command that names it, so the sweep buys that hook nothing the name does not already give it.

#### Cross-repo Bash edits

The hook's cwd is the session cwd; a `cd` inside the shell command does not move it. So a command that writes markdown in a _different_ repo (`cd /other/repo && cat > UPGRADING.md <<'EOF'`) used to be invisible: the sweep was scoped to the session repo's toplevel only, and the file stayed unformatted until something else touched it.

So the sweep collects roots instead of assuming one: the session cwd, plus every absolute path named in `tool_input.command` (a directory as-is, a file by its parent). Each is resolved to its git toplevel, deduped, and swept. Non-repo paths and paths that do not exist drop out silently, and a command that names no absolute path behaves exactly as before.

Only **absolute** paths are followed. A relative path in the command is ambiguous after an arbitrary `cd`, and guessing wrong would sweep the wrong repo. So a cross-repo edit reached by a relative `cd ../other-repo` is still missed; use an absolute path, or make the edit through Write/Edit. The trade-off is marked with a `shortcut:` comment in `core.ts`.

#### Nested repos and submodules

A git repo inside a repo is opaque to the parent, so the parent sweep cannot see its markdown. An embedded repo appears in `git ls-files --others` as one bare `nested/` entry, never as the files inside it; a submodule appears in `git diff HEAD` as a gitlink path. Both are directories, so the file filter dropped them and the inner markdown stayed unformatted.

A worktree checked out inside the repo (`git worktree add .worktrees/feat`) is the same case, and the most common one here: the parent lists `.worktrees/feat/` as one entry, because the worktree directory holds a `.git` file rather than tracked content. `git rev-parse --show-toplevel` inside it returns the worktree path, not the main repo, so the worktree becomes a root of its own and its changed and untracked markdown is swept there.

So the roots are a queue, not a fixed list. The sweep loop enumerates one root, sends file entries to the candidate list and directory entries back onto the queue as roots of their own, and continues until the queue is drained. Any nesting depth is covered, and the membership check on push keeps a symlink that points back at an existing root from looping. `test/check.ts` covers a plain subdirectory, an embedded repo, an embedded repo two levels down, and a dirty submodule.

Note the side effect: any repo whose absolute path appears in a shell command gets its changed and untracked markdown formatted, even if the command only read from it. That is the same pass the session repo already gets, and it only ever touches files git already reports as modified or untracked.

Git failures (not a repo, no commits so no `HEAD`) are swallowed, and the hook drops the stderr of git, so "not a git repository" never shows as hook noise. The sweep finds nothing and ends clean.

#### A Bash command that writes a file and then fails

A shell command that exits with a code other than 0 can still have written a file: `cat > notes.md <<'EOF' ... EOF && just fmt-check` writes the file, then fails the check. Measured on 2026-09-19 with the old command hook, which Claude Code ran only on `PostToolUse`: the exit 0 file came back column-aligned, the exit 1 file was untouched. The hook then got a second entry on `PostToolUseFailure`.

Each adapter now runs on a failed call too. The mod runs after `next` for each result, pi sends `tool_result` for each result, and Codex runs `PostToolUse` also after a Bash command that exits with a code other than 0.

`command.ts` sends the amend hint below as `hookSpecificOutput`, whose `hookEventName` is the discriminant of a schema for each event. So it reads `hook_event_name` from the payload and echoes it back, and uses `PostToolUse` only when the payload has none.

The sweep also runs after you interrupt a shell command. That is wanted: an interrupted command can leave a half-written file, and Prettier is safe to run on one.

#### Write and commit in one command

A single Bash call can write a file, commit it, and push it (`cat > README.md <<'EOF' ... && git commit -am docs && git push`). By the time the hook runs the tree is clean, so the working-tree sweep finds zero candidates and exits, and the unformatted table is already in the pushed commit.

So when the command text contains `git commit`, each root also contributes the files of the last commit (`git diff-tree --no-commit-id --name-only -r --root --diff-filter=d HEAD`). `--root` makes the first commit of a repo answer too, because it has no `HEAD~1`.

Formatting those files fixes the file, not the commit: the commit still holds the unformatted version, and the working tree is now dirty. Only the agent can amend, so the hook tells the model, with a hint that names the files Prettier changed: `context` in the mod, an appended text block in pi, and `hookSpecificOutput.additionalContext` in Codex. Two conditions gate the hint. Prettier must have changed the file, which the hook finds by a compare of the text before and after the run. And the last commit must hold the file (`git diff-tree --root HEAD -- <file>`). In an agent session, the [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) pre-commit hook formats the file before the commit, so this hint appears only when that hook skipped the file: a file with unstaged changes, a `--no-verify` commit, or a machine with no `node` for git. A test of the hint must turn that hook off, or the hint never appears.

## Supported extensions

| Extension                  | Parser     |
| -------------------------- | ---------- |
| `.md` `.markdown`          | markdown   |
| `.js` `.jsx` `.mjs` `.cjs` | babel      |
| `.ts` `.tsx` `.mts` `.cts` | typescript |
| `.json`                    | json       |
| `.css` `.scss`             | css / scss |
| `.html`                    | html       |
| `.yml` `.yaml`             | yaml       |

Any other extension is a clean skip, so the hook never invokes Prettier for files it does not cover. `.org` is covered by a separate hook, [`format-org-tables`](../format-org-tables/README.md), because Prettier has no Org parser. On the Bash sweep the filter is narrowed further to `.md`/`.markdown` only, per the reasoning above.

## Throwaway files

A path under `/tmp`, `/var/tmp` or `$TMPDIR` is skipped on both paths: the scratchpad of the agent lives there, and a file it is about to throw away is not project code. macOS resolves `/tmp` to `/private/tmp` and `$TMPDIR` to `/private/var/folders/...`, and the path a payload carries holds that prefix while `$TMPDIR` does not, so both sides of the comparison drop a leading `/private`. [`lint-code`](../lint-code/README.md) and [`format-org-tables`](../format-org-tables/README.md) skip the same paths.

## Prose wrapping

Everything is formatted with `--prose-wrap preserve`, so Prettier keeps the line breaks the author wrote. This supports the rule in `writing.md`: one sentence per line in documentation files. It affects markdown/MDX paragraphs and YAML block scalars (`>` and `|`); it has no effect on JSON, JS, TS, or CSS.

`--prose-wrap never` would join the lines of each paragraph into one line. It also stops Prettier from padding a table wider than `printWidth` (default `80`): the table collapses to the compact `| --- |` form. Under `preserve`, Prettier pads every table, so markdown and code run in one pass at the default width.

## Never blocks

Unlike `lint-code`, this hook never blocks a call and never marks a result as an error. A missing Prettier, a parse error, or any other failure leaves the file as it is. A formatter should reshape working code, not reject an edit.

| Adapter           | On a failure                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Mod               | Claude Code skips a hook that throws, and the result stands.                                     |
| `pi.ts`, `omp.ts` | The handler catches the error and returns nothing.                                               |
| `command.ts`      | Node exits 1, which Codex shows as a failed hook and does not block. A missing Prettier exits 0. |

The core stops Prettier after 20 s. Codex stops `command.ts` after 20 s, the `timeout` of its entry.

## Requirements

- **Prettier** on `PATH`, see below.
- **git**, for the Bash sweep and the amend hint.
- **Node 23.6 or later** for `command.ts`, which Codex and `format-staged-files` run. With no `node`, the Codex entry exits 0, and the `SessionStart` check of Codex shows a warning. The mod and `pi.ts` need no `node` of their own.

## Installing Prettier

The hook calls the `prettier` binary directly (like `lint-code` calls its linters), so any Prettier on `PATH` works, global, yarn-global, or a project `node_modules/.bin` on `PATH`. It never triggers a network install. Install it whichever way suits you:

```sh
pnpm install -g prettier
```

A per-project `.prettierrc` in the file's directory tree is picked up automatically, so project style wins over Prettier defaults. Note that a `proseWrap` set in a project `.prettierrc` does not override the `--prose-wrap preserve` above, because a command-line option wins.

## Prettier's own ignore rules

Prettier 3 defaults `--ignore-path` to `.gitignore` **and** `.prettierignore`, so a gitignored file is skipped, silently and with exit `0`. That is a second blind spot behind the one in [Markdown the command names](#markdown-the-command-names): handing the file to Prettier is not enough, because Prettier refuses it for the same reason the sweep missed it.

So the hook passes `--ignore-path .prettierignore`, which drops `.gitignore` from that list and keeps `.prettierignore`. `.prettierignore` is a formatting decision and is honoured; `.gitignore` is a version-control decision and says nothing about formatting. Prettier still skips `node_modules` on its own, without `--with-node-modules`.

Prettier runs in the session cwd: `$.session.cwd()` in the mod, `ctx.cwd` in pi, and the payload `cwd` in `command.ts`. It finds both files from there, so a `.prettierignore` in another repo does not apply to a cross-repo edit. That was already true of Prettier's default lookup.

## Tests

```sh
node test/check.ts
```

[`test/check.ts`](test/check.ts) runs `command.ts` with real git repositories and the real Prettier, in a fixture under `$HOME`, because the hook skips `/tmp` and `$TMPDIR`:

- **The sweep:** the roots it reaches (a plain subfolder, an embedded repo at depth 1 and 2, a dirty submodule, a worktree, a repo with no `HEAD`, a second repo by absolute path) and what it leaves alone (`.ts` and `.json` on Bash, ignored Markdown, a symlink back to a root).
- **Named paths:** a named file outside any repo, an ignored file, a relative path, a path that does not exist, and a file in `.prettierignore`.
- **Prose wrap:** a wide table stays padded, and sentence lines stay apart.
- **The amend hint:** after a commit, on `PostToolUseFailure` with that event name, on the first commit of a repo, and none without a commit, for an uncommitted file, or when Prettier changed nothing.
- **A Write or Edit:** `.ts` is formatted, `.org`, `.py`, and a temp file are not.
- **The adapters:** `pi.ts`, `omp.ts`, and `hooks/register.ts` with stubs over the real files.

The check turns off `format-staged-files` with `GIT_CONFIG_*` variables, and skips with a message when git or Prettier is missing.

## Files

| File                                                             | Role                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`core.ts`](core.ts)                                             | Finds the files and runs Prettier. No Node imports.                       |
| [`io.ts`](io.ts)                                                 | The file and process functions of the core under Node                     |
| [`command.ts`](command.ts)                                       | The command hook for Codex and `format-staged-files`                      |
| [`pi.ts`](pi.ts)                                                 | The pi extension, which omp also loads                                    |
| [`omp.ts`](omp.ts)                                               | The omp extension, after `pi.ts`: the omp calls that `pi.ts` does not see |
| [`hooks/register.ts`](hooks/register.ts), `hooks/hooks.json`     | The Claude Code mod                                                       |
| [`dot_claude-plugin/plugin.json`](dot_claude-plugin/plugin.json) | The plugin manifest, deployed as `.claude-plugin/plugin.json`             |
