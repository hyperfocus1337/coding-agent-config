# format-prettier

Formats the files that a Write, an Edit, or a Bash call changed with [Prettier](https://prettier.io/), selected by extension. It runs after each tool call, so the model reads back formatted files and Markdown tables stay aligned while the model edits them.

One core, [`core.ts`](core.ts), serves four agents through three adapters. An adapter connects the core to one agent. A mod is a Claude Code hook module that runs in the Claude Code process, and a command hook is a program that the agent starts for each call.

| Agent       | Adapter                                                                                                                                                                 | Loaded by                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash formats after `next`                                                              | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                    |
| pi          | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash                                                                                                                | `extensions` in `dot_pi/agent/modify_settings.json`                                  |
| omp         | [`pi.ts`](pi.ts) as in pi, and [`omp.ts`](omp.ts): `tool_result` on an omp edit of more than one file, an `ast_edit` that a write to `xd://resolve` applies, and `eval` | `extensions` in `dot_omp/private_agent/private_config.yml`                           |
| Codex       | [`command.ts`](command.ts), a command hook: the amend hint as `hookSpecificOutput` JSON on stdout                                                                       | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts` |

The git pre-commit hook [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) also runs `command.ts`, once for each staged file.

## What it checks

The hook runs after each Write, Edit, and Bash call, also after a call that failed. It tells the calls apart by the file path: a Write or an Edit names one file in `file_path`, and a Bash call names none.

- **A Write or an Edit:** the hook formats the one file that the call names, if Prettier supports its extension.
- **A Bash call:** the hook formats only Markdown files: the files that the command names, and the files that git reports as changed or untracked. See [Bash (markdown sweep)](#bash-markdown-sweep).
- **omp:** `omp.ts` also formats each file of an edit of more than one file, and each file of an applied `ast_edit`. It treats the code of an `eval` call as a Bash command.
- **Codex `apply_patch`:** `apply-patch.ts` runs `command.ts` once for each file in the patch, as a Write.

### Supported extensions

| Extension                  | Parser     |
| -------------------------- | ---------- |
| `.md` `.markdown`          | markdown   |
| `.js` `.jsx` `.mjs` `.cjs` | babel      |
| `.ts` `.tsx` `.mts` `.cts` | typescript |
| `.json`                    | json       |
| `.css` `.scss`             | css / scss |
| `.html`                    | html       |
| `.yml` `.yaml`             | yaml       |

The hook skips any other extension and does not start Prettier for it. The separate hook [`format-org-tables`](../format-org-tables/README.md) formats `.org`, because Prettier has no Org parser. A Bash call formats only `.md` and `.markdown`.

### Skipped files

- A file with an extension that is not in the table.
- A file under `/tmp`, `/var/tmp`, or `$TMPDIR`. See [Throwaway files](#throwaway-files).
- A file that `.prettierignore` lists, and a file in `node_modules`. See [Prettier's own ignore rules](#prettiers-own-ignore-rules).
- A path that is not a regular file, or that does not exist.

## Requirements

- **Prettier** on `PATH`. Any Prettier on `PATH` works: a global install, a yarn global install, or a project `node_modules/.bin` on `PATH`.
- **git**, for the Bash sweep and the amend hint.
- **Node 23.6 or later** for `command.ts`, which Codex and `format-staged-files` run. With no `node`, the Codex entry exits 0, and the `SessionStart` check of Codex shows a warning. The mod and `pi.ts` need no `node` of their own.

The hook starts the `prettier` binary directly, as `lint-code` starts its linters. It never installs Prettier from the network. To install Prettier:

```sh
pnpm install -g prettier
```

## How it works

1. If `CLAUDE_HOOKS_DISABLE` names `format-prettier`, the hook stops.
2. The hook collects the candidate files: the file of a Write or an Edit, or the Markdown files of the [Bash sweep](#bash-markdown-sweep).
3. It keeps each candidate once, and only if the extension matches, the path is not a throwaway path, and the path is a regular file.
4. It runs Prettier one time on all the files that it kept, in the session folder, and stops Prettier after 20 s.
5. If a Bash command committed, it compares each file before and after Prettier and can give the [amend hint](#write-and-commit-in-one-command).

The Prettier command is:

```sh
prettier --write --prose-wrap preserve --ignore-path .prettierignore <files>
```

### Bash (markdown sweep)

A Bash call has no `file_path`, but a shell command (`sed`, `perl`, `echo`, a redirect) can change files. Markdown is the most important case: a table that a command changed stays misaligned until the next Edit. So on a Bash call, the hook sweeps the git working tree for Markdown files:

1. It takes each Markdown path that the command names. See [Markdown the command names](#markdown-the-command-names).
2. It finds the roots: the session folder and each absolute path in the command, each resolved to its git top level. See [Cross-repo Bash edits](#cross-repo-bash-edits).
3. In each root, it lists the Markdown files that changed against `HEAD` (`git diff --name-only --diff-filter=d HEAD`) and the untracked files (`git ls-files --others --exclude-standard`).
4. If the command commits, it also lists the files of the last commit. See [Write and commit in one command](#write-and-commit-in-one-command).
5. A folder entry in a list is a repository inside the root, and becomes a root of its own. See [Nested repos and submodules](#nested-repos-and-submodules).

The sweep is Markdown only. A Write or an Edit formats each supported extension, because the edit is the reason to format. A Bash call does not, because a format of each changed `.ts`, `.css`, or `.json` file after each shell command would interfere with edits that are not complete.

Misaligned Markdown tables are the problem that justifies a sweep of the whole repository. Other files do not. So a non-Markdown file that a shell command writes stays unformatted until an Edit changes it, see [The gap that format-staged-files closes](docs/implementation.md#the-gap-that-format-staged-files-closes).

### Markdown the command names

The sweep asks git what changed, so it cannot find a file that git does not report. The hooks run after the full command ends. A command that writes `docs/refactor.md` and adds it to `.gitignore` leaves a file that `git ls-files --others --exclude-standard` does not list.

So before the hook asks git, it takes each `.md` or `.markdown` path in the command text and formats it directly. An absolute path stays as it is, and a relative path resolves against the session folder. A file that the command names is a file that the model writes now, so it gets a format pass that the other ignored files do not get.

- A named path that is not a file drops out at the file check.
- A named file is formatted also when the session folder is in no repository.
- A `cd` in the command does not change the session folder, so a relative path after a `cd` can resolve to the wrong file. The file check then skips it, or the hook formats a file with the same name that is already formatted.

### Cross-repo Bash edits

The session folder of the hook does not change when the command runs `cd`. A command such as `cd /other/repo && cat > UPGRADING.md <<'EOF'` writes Markdown in a different repository.

So the sweep has more than one root: the session folder, and each absolute path in `tool_input.command`. A folder counts as it is, and the hook uses the parent folder of any other path. The hook resolves each root to its git top level and removes duplicates.

- A path that is not in a repository drops out with no message.
- A path that does not exist drops out if its parent folder does not exist. If the parent folder is in a repository, that repository becomes a root.
- A command that names no absolute path sweeps only the session folder.

The hook follows only absolute paths. A relative path is ambiguous after a `cd`, and a wrong guess sweeps the wrong repository. So the hook misses an edit in a different repository after a relative `cd ../other-repo`: use an absolute path, or make the edit with a Write or an Edit.

A `shortcut:` comment in `core.ts` marks this limit.

One side effect: the hook formats the changed and untracked Markdown of each repository whose absolute path is in a command, also when the command only reads from it. That repository gets the same pass as the session repository, and the hook changes only files that git reports as changed or untracked.

### Nested repos and submodules

A git repository inside a repository is opaque to the parent repository, so the sweep of the parent cannot see its Markdown files.

- **An embedded repository** shows in `git ls-files --others` as one `nested/` entry, not as the files in it.
- **A submodule** shows in `git diff HEAD` as a gitlink path.
- **A worktree in the repository** (`git worktree add .worktrees/feat`) shows as one `.worktrees/feat/` entry, because the folder holds a `.git` file and no tracked content. This is the most frequent case here.

The roots are a queue. The sweep lists the files of one root and adds each folder entry to the queue as a new root, with its own git top level. For a worktree, `git rev-parse --show-toplevel` gives the worktree path, so the hook sweeps the worktree as a root of its own.

The sweep continues until the queue is empty, so it covers each nesting depth. The roots are a set, so a symlink that points back to a root does not add that root a second time and cannot cause a loop.

### Write and commit in one command

One Bash call can write a file, commit it, and push it: `cat > README.md <<'EOF' ... && git commit -am docs && git push`. When the hook runs, the working tree is clean, so the working-tree sweep finds no files. The pushed commit holds the unformatted table.

So when the command runs `git commit`, also with global options as in `git -C <dir> commit`, the sweep also takes the files of the last commit in each root: `git diff-tree --no-commit-id --name-only -r --root --diff-filter=d HEAD`. `--root` makes this work for the first commit of a repository, which has no `HEAD~1`.

The format changes the file, not the commit. The commit holds the unformatted text, and the working tree is now dirty. Only the model can amend the commit, so the hook gives the model the amend hint, see [What the model sees](#what-the-model-sees).

In an agent session, the [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) pre-commit hook formats the file before the commit. So the amend hint comes only when that hook skipped the file:

- A file with unstaged changes.
- A `git commit --no-verify`.
- A computer where git has no `node`.

### Throwaway files

The hook skips a path under `/tmp`, `/var/tmp`, or `$TMPDIR`, for a Write, an Edit, and a Bash call. The scratchpad of the agent is there, and a file that the agent will delete is not project code. [`lint-code`](../lint-code/README.md) and [`format-org-tables`](../format-org-tables/README.md) skip the same paths.

### Prose wrapping

The hook runs Prettier with `--prose-wrap preserve`, so Prettier keeps the line breaks that the author wrote. A paragraph on one line, as `writing.md` asks, stays on one line.

The setting changes Markdown and MDX paragraphs. In YAML, it changes folded block scalars (`>`) and plain or quoted strings on more than one line, and a literal block scalar (`|`) keeps its lines. It has no effect on JSON, JS, TS, or CSS.

Prettier pads each table under `preserve`, so one Prettier run formats Markdown and code at the default width. [Why not `--prose-wrap never`](docs/implementation.md#why-not---prose-wrap-never) gives the rejected alternative.

### Prettier's own ignore rules

Prettier 3 reads both `.gitignore` and `.prettierignore` as the default `--ignore-path`. So it skips a gitignored file with no message and exit `0`. That is a second blind spot after the one in [Markdown the command names](#markdown-the-command-names): Prettier rejects the file for the same reason that the sweep did not find it.

So the hook passes `--ignore-path .prettierignore`. This removes `.gitignore` from the list and keeps `.prettierignore`. `.prettierignore` is a formatting decision, so the hook obeys it, but `.gitignore` is a version-control decision and does not apply to formatting.

Prettier still skips `node_modules` without `--with-node-modules`. Prettier runs in the session folder: `$.session.cwd()` in the mod, `ctx.cwd` in pi, and the payload `cwd` in `command.ts`. It finds both ignore files from there, so a `.prettierignore` in a different repository does not apply to an edit in that repository, as with the default lookup of Prettier.

## What the model sees

In most calls the hook gives the model no output. The model sees the formatted file when it reads the file again. A format directly after a Write can make the copy of the file that the model has stale, see [Why after each call, and not Stop](docs/implementation.md#why-after-each-call-and-not-stop).

The amend hint is the only output. It comes when all of these conditions are true:

- The Bash command runs `git commit`.
- Prettier changed the file. The hook compares the text before and after the Prettier run.
- The last commit holds the file (`git diff-tree --root HEAD -- <file>`).

The hint names each file that it applies to:

```text
Prettier reformatted markdown after your commit, so the commit holds the unformatted version and the working tree is now dirty: <files>. Fold the formatting into that commit (amend, or a fixup commit if it is already pushed).
```

| Adapter           | How the hint reaches the model                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Mod               | `context` on the result of the call                                                                                         |
| `pi.ts`, `omp.ts` | A text block added after the content of the result                                                                          |
| `command.ts`      | `hookSpecificOutput.additionalContext` on stdout. `hookEventName` is the `hook_event_name` of the payload, or `PostToolUse` |

The hook never blocks a call and never marks a result as an error. `command.ts` exits 0, also when Prettier is missing.

## What you see

When the hook works, you see only the formatted files. A missing Prettier, a parse error, and a git error give no message. In Codex, a `command.ts` that crashes shows as a failed hook, and with no `node` the `SessionStart` check shows a warning.

## Settings

| Setting                                              | Effect                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_HOOKS_DISABLE`                               | A value that names `format-prettier`, separated by spaces or commas, turns the hook off. The hook reads it on each run. |
| `.prettierrc`                                        | Prettier finds it in the folder tree of the file, so the style of the project overrides the defaults of Prettier.       |
| `.prettierignore`                                    | Prettier skips the files that it lists.                                                                                 |
| `git config hook.claude-format-staged.enabled false` | Turns off `format-staged-files` in one repository. That hook ignores `CLAUDE_HOOKS_DISABLE`.                            |

A `proseWrap` in a project `.prettierrc` does not change `--prose-wrap preserve`, because a command-line option overrides the config file.

To turn the hook off until you quit the agent, use [`/toggle-hook`](../toggle-hook/README.md) in Claude Code, pi, or omp. In Codex, set `CLAUDE_HOOKS_DISABLE` when you start Codex.

To remove the hook from one agent, remove its entry from the file in the "Loaded by" column of the adapter table. In Codex, remove the two entries in `dot_codex/modify_hooks.json`, one for Bash and one for `apply_patch`.

## Failure behavior

The hook fails open: when it fails, the tool call and its result stay as they are. A formatter changes the layout of working code. It must not reject an edit.

- **Prettier is missing:** the files stay as they are, with no message.
- **Prettier cannot parse a file:** the file stays as it is, with no message.
- **Prettier runs for more than 20 s:** the core stops Prettier. Codex stops `command.ts` after 20 s, the `timeout` of its entry.
- **git fails** (not a repository, or no commits and so no `HEAD`): the hook ignores the failure and drops the stderr of git, so "not a git repository" does not show. The sweep finds no files from that list and ends with no error.

When the code of the hook throws an error, each adapter fails open:

| Adapter           | On a failure                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Mod               | Claude Code skips a hook that throws, and the result stands.                                     |
| `pi.ts`, `omp.ts` | The handler catches the error and returns nothing.                                               |
| `command.ts`      | Node exits 1, which Codex shows as a failed hook and does not block. A missing Prettier exits 0. |

## Testing

[`test/check.ts`](test/check.ts) runs the hook against real git repositories and the real Prettier, see [docs/testing.md](docs/testing.md).
