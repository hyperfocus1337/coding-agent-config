# format-staged-files

A git `pre-commit` hook that formats the staged files before a commit made in an agent session, so the commit holds the formatted text. The agent formatter hooks run only after a tool call ends, which is too late when one Bash command writes a file and commits it.

It is a git hook, not an agent hook: it has no adapters, and it never stops a commit.

## What it checks

Git starts the hook on each `git commit`, in each repository. The hook formats only when the commit runs in an agent session. Each agent sets a variable in the processes that it starts, and the hook runs when one of these is set:

| Agent       | Variable                     |
| ----------- | ---------------------------- |
| Claude Code | `CLAUDECODE=1`               |
| pi          | `PI_CODING_AGENT=true`       |
| omp         | `OMPCODE=1`                  |
| Codex       | `CODEX_THREAD_ID`, any value |

The hook takes the staged files that the commit adds, copies, modifies, or renames. It gives all of these files to the formatters of [`format-prettier`](../../../../dot_claude/hooks/format-prettier/README.md), [`format-org-tables`](../../../../dot_claude/hooks/format-org-tables/README.md), and [`format-terraform`](../../../../dot_claude/hooks/format-terraform/README.md). The formatting rules stay in those hooks: the extensions, `.prettierignore`, `--prose-wrap preserve`, and the skip of `/tmp` and `$TMPDIR`.

The hook skips these files, and the commit takes them as staged:

- A symlink, a submodule, or another path that is not a regular file.
- A file that has unstaged changes.

The hook runs no linters. [Design notes](#design-notes) gives the reason.

## Requirements

- **git** with config-based hooks: `hook.<name>.command` and `hook.<name>.event`. These need a recent git. An older git ignores the `hook.*` entries and shows no error.
- **Node 23.6 or later** on `PATH`, which runs a `.ts` file.
- **The three formatter hooks** in `~/.claude/hooks/`, and their tools: `prettier`, `emacs`, and `terraform`. Each formatter hook README tells how to install its tool.

## How it works

### How git starts the hook

[`dot_config/git/config`](../../config) sets two hooks in `~/.config/git/config`, the global config file that git reads with no include:

```ini
[hook "claude-format-staged"]
	event = pre-commit
	command = "command -v node >/dev/null || exit 0; NODE_COMPILE_CACHE=\"$HOME/.cache/node-compile-cache\" node \"$HOME/.config/git/hooks/format-staged-files/main.ts\" || true"
[hook "claude-format-staged-post"]
	event = post-commit
	command = "[ -f \"$(git rev-parse --git-path format-staged-files)\" ] || exit 0; command -v node >/dev/null || exit 0; NODE_COMPILE_CACHE=\"$HOME/.cache/node-compile-cache\" node \"$HOME/.config/git/hooks/format-staged-files/main.ts\" post-commit || true"
```

The `post-commit` hook starts `node` only when the `pre-commit` run left its record file, see [`git commit <path>`](#git-commit-path).

`hook.<name>.command` with `hook.<name>.event` defines a config-based hook (see `git-config(1)` and `git-hook(1)`). Git runs the command in a shell for every commit. Because the hook is in the global config, it runs in every repository, with no install step for each repository.

A repository's own `.git/hooks/pre-commit` or `core.hooksPath` hook still runs. Git runs config-based hooks first and the hook in the hook directory last.

### What the hook does

1. [`main.ts`](main.ts) exits at once when no agent variable is set. A commit outside an agent costs one Node start, see [research](docs/research.md).
2. It lists the staged files with `git diff --cached --raw`. For `git commit -a` and `git commit <path>`, git builds a temporary index and sets `GIT_INDEX_FILE`, so the list holds the files that this commit takes.
3. It runs the `command.ts` of `format-prettier`, `format-org-tables`, and `format-terraform` once each. Each run gets a `PostToolUse` payload that names all regular files without unstaged changes in `tool_input.file_paths`.
4. It runs `git add` on the files that a formatter changed. Git reads the index again after the `pre-commit` hook, so the commit takes the formatted version.
5. It writes the path and the old blob ID of each staged file to `format-staged-files` in the git folder, and prints one line to stderr for each file.
6. After the commit, the `post-commit` run reads that record and deletes it. When the real index still holds the old blob of a file, it copies the committed version into the index with `git reset`.

## What the model sees

The model sees the output of `git commit` in the Bash result. For each file that the hook changed, the output holds this line:

```text
format-staged-files: reformatted and restaged <path>
```

Git passes this line through, also with `git commit -q`, so the model learns that the commit changed the file. The hook drops the output of the formatters. The hook command always exits 0, so the commit continues.

## What you see

You see the same line in the Bash output of the transcript. A commit that you make yourself, outside an agent, shows no output from this hook.

## Settings

- **One repository:** run this command in the repository to turn the hook off there. The `post-commit` hook then finds no record file and does not start `node`.

  ```sh
  git config hook.claude-format-staged.enabled false
  ```

- **One commit:** use `git commit --no-verify`.
- **A test that commits:** see [Shared conventions](../../../../dot_claude/hooks/README.md#shared-conventions).

`CLAUDE_HOOKS_DISABLE` does not turn this hook off. The hook removes the variable before it runs the formatters, so a formatter that [`/toggle-hook`](../../../../dot_claude/hooks/toggle-hook/README.md) turned off in the agent still formats the commit.

## Failure behavior

The hook fails open: a failure never stops the commit.

- **No `node` on `PATH`:** the command exits 0. The commit continues with no output.
- **A failed run of `main.ts`**, for example with a `node` older than 23.6: `|| true` keeps the commit going. The command does not drop the stderr of `node`, so its error text can show in the commit output.
- **An older git:** git ignores the `hook.*` entries and shows no error.
- **A skipped file:** the commit takes the file as staged. The amend hint of the formatters stays as the fallback for it.

## Testing

[`test/check.ts`](test/check.ts) makes real commits in a temporary repository, see [testing](docs/testing.md).

## Design notes

### Why a pre-commit hook

The formatters `format-prettier`, `format-org-tables`, and `format-terraform` run after a tool call ends. When one Bash command writes a file and commits it, the commit already holds the unformatted text by the time the formatters run. The formatters then tell the model to amend.

A `pre-commit` hook runs inside `git commit`, after the command wrote the file and before git writes the commit, so the commit gets the formatted file. [Research](docs/research.md) gives how often the amend occurred before this hook.

### The hook command

The value of `command` is in quotes, because git reads a `;` outside quotes as the start of a comment. The command exits 0 when `node` is missing, and `|| true` keeps a failed run from stopping the commit.

### Skipped files

A `git add` of a file with unstaged changes would also stage those changes and put them in the commit. So the hook commits that file as staged.

### git commit \<path\>

`git commit <path>` and `git commit --only` build a temporary index for the commit, and write the real index before the `pre-commit` hook runs. The `git add` of the hook changes only the temporary index. Without the `post-commit` run, the commit and the working tree hold the formatted file, but the real index holds the unformatted one, and `git status` shows `MM`. The next `git commit -a` would then commit the unformatted text again.

Git writes the real index before `post-commit`, and runs that hook with `GIT_INDEX_FILE` set to it. The `post-commit` run changes only an entry that still holds the blob from before the format. So a stale record, for example from a commit that a `commit-msg` hook stopped, cannot change what you staged later.

### Limits

- The linters do not run here. `lint-code` and `lint-prose` check whole files, so a linter at `pre-commit` would stop commits because of problems that were in the file before.
