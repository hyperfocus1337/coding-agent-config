# format-staged-files

A git `pre-commit` hook that formats the staged files before a commit made in an agent session, so the commit holds the formatted text. It is a git hook, not a Claude Code hook, and it never stops a commit.

## Why it exists

The `PostToolUse` formatters run after a tool call ends. When one Bash command writes a file and commits it, the commit already holds the unformatted text by the time the formatters run. `format-all-languages` then tells the model to amend. In 205 sessions from 2026-08-30 to 2026-09-27, this occurred approximately 60 times, in at least 5 repositories. See [hook event scoping](../../../docs/research/hooks/event-scoping.md). A `pre-commit` hook runs inside `git commit`, after the command wrote the file and before git writes the commit, so the commit gets the formatted file.

## How it is wired

[`dot_config/git/config`](../../../dot_config/git/config) sets the hook in `~/.config/git/config`, the global config file that git reads with no include:

```ini
[hook "claude-format-staged"]
	event = pre-commit
	command = bash \"$HOME/.claude/hooks/format-staged-files/hook.sh\"
```

`hook.<name>.command` with `hook.<name>.event` defines a config-based hook (see `git-config(1)` and `git-hook(1)`). Git runs it for every commit, and `hook.sh` exits at once when `CLAUDECODE` is not `1`. Claude Code sets `CLAUDECODE=1` in the processes that it starts. This has three results:

- The hook formats only in agent sessions. Commits that you make in your own terminal start the script, and the script exits.
- The hook runs in every repository, with no install step per repository.
- A repository's own `.git/hooks/pre-commit` or `core.hooksPath` hook still runs. Git runs config-based hooks first and the hook directory hook last.

To turn the hook off in one repository, run `git config hook.claude-format-staged.enabled false` there. To skip it for one commit, use `git commit --no-verify`. To turn it off in a test, see [Shared conventions](../README.md#shared-conventions).

## What it does

1. It lists the staged files with `git diff --cached`: added, copied, modified, and renamed files. For `git commit -a` and `git commit <path>`, git builds a temporary index and sets `GIT_INDEX_FILE`, so the list holds the files that this commit takes.
2. For each regular file, it sends a `PostToolUse` payload with `tool_input.file_path` to [`format-all-languages`](../format-all-languages/README.md) and [`format-org-tables`](../format-org-tables/README.md). The formatting rules stay in those two hooks: the extensions, `.prettierignore`, `--prose-wrap preserve`, and the skip of `/tmp` and `$TMPDIR`.
3. When a formatter changed the file, it runs `git add` on that file. Git reads the index again after the `pre-commit` hook, so the commit takes the formatted version. It also prints `format-staged-files: reformatted and restaged <path>` to stderr. Git passes this line through, also with `git commit -q`, so the Bash output shows that the commit changed the file.

It skips a file that has unstaged changes. A `git add` of that file would also stage the unstaged changes and put them in the commit. The file is committed as staged, and the `PostToolUse` amend hint stays as the fallback for it.

## Limits

- One formatter run per file. Prettier takes approximately 0.4 s per run, so a commit of 30 files adds approximately 12 s.
- The gate checks only `CLAUDECODE`. Codex and pi sessions do not get the hook.
- Config-based hooks need a recent git. An older git ignores the `hook.*` entries and shows no error. The test fails its first check on such a git.
- The linters do not run here. `lint-all-languages` and `lint-prose` check whole files, so a linter at `pre-commit` would stop commits because of problems that were in the file before.

## Test

```sh
bash test/test.sh
```

The test sets the hook through `GIT_CONFIG_*` environment variables, so it does not depend on `~/.config/git/config`. It makes commits in a temporary repository under `$HOME`, because the formatters skip `/tmp`. It needs `jq`, `git`, and `prettier`. The Org case also needs `emacs`, and the test skips that case when `emacs` is not installed.
