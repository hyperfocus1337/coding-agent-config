# format-staged-files

A git `pre-commit` hook that formats the staged files before a commit made in an agent session, so the commit holds the formatted text. It is a git hook, not an agent hook, and it never stops a commit.

## Why it exists

The formatters [`format-prettier`](../../../../dot_claude/hooks/format-prettier/README.md) [`format-org-tables`](../../../../dot_claude/hooks/format-org-tables/README.md), and [`format-terraform`](../../../../dot_claude/hooks/format-terraform/README.md) run after a tool call ends. When one Bash command writes a file and commits it, the commit already holds the unformatted text by the time the formatters run. The formatters then tell the model to amend.

In 205 sessions from 2026-08-30 to 2026-09-27, this occurred approximately 60 times, in at least 5 repositories. See [hook event scoping](../../../../docs/research/hooks/event-scoping.md). A `pre-commit` hook runs inside `git commit`, after the command wrote the file and before git writes the commit, so the commit gets the formatted file.

## How it is wired

[`dot_config/git/config`](../../config) sets the hook in `~/.config/git/config`, the global config file that git reads with no include:

```ini
[hook "claude-format-staged"]
	event = pre-commit
	command = "command -v node >/dev/null || exit 0; NODE_COMPILE_CACHE=\"$HOME/.cache/node-compile-cache\" node \"$HOME/.config/git/hooks/format-staged-files/main.ts\" || true"
```

The value is in quotes, because git reads a `;` outside quotes as the start of a comment.

`hook.<name>.command` with `hook.<name>.event` defines a config-based hook (see `git-config(1)` and `git-hook(1)`). Git runs the command in a shell for every commit. The command exits 0 when `node` is missing, and `|| true` keeps a failed run, such as a `node` older than 23.6, from stopping the commit. This has three results:

- The hook formats only in agent sessions. [`main.ts`](main.ts) exits at once when no agent variable is set, so your own commits cost one Node start, about 20 ms.
- The hook runs in every repository, with no install step per repository.
- A repository's own `.git/hooks/pre-commit` or `core.hooksPath` hook still runs. Git runs config-based hooks first and the hook directory hook last.

To turn the hook off in one repository, run `git config hook.claude-format-staged.enabled false` there. To skip it for one commit, use `git commit --no-verify`. To turn it off in a test, see [Shared conventions](../../../../dot_claude/hooks/README.md#shared-conventions).

## Agent detection

Each agent sets a variable in the processes that it starts. The hook runs when one of these is set:

| Agent       | Variable                     |
| ----------- | ---------------------------- |
| Claude Code | `CLAUDECODE=1`               |
| pi          | `PI_CODING_AGENT=true`       |
| omp         | `OMPCODE=1`                  |
| Codex       | `CODEX_THREAD_ID`, any value |

## What it does

1. It lists the staged files with `git diff --cached`: added, copied, modified, and renamed files. For `git commit -a` and `git commit <path>`, git builds a temporary index and sets `GIT_INDEX_FILE`, so the list holds the files that this commit takes.
2. For each regular file, it runs the `command.ts` of `format-prettier`, `format-org-tables`, and `format-terraform` with a `PostToolUse` payload that names the file in `tool_input.file_path`. The formatting rules stay in those hooks: the extensions, `.prettierignore`, `--prose-wrap preserve`, and the skip of `/tmp` and `$TMPDIR`.
3. When a formatter changed the file, it runs `git add` on that file. Git reads the index again after the `pre-commit` hook, so the commit takes the formatted version. It also prints `format-staged-files: reformatted and restaged <path>` to stderr. Git passes this line through, also with `git commit -q`, so the Bash output shows that the commit changed the file.

It skips a symlink, and a file that has unstaged changes. A `git add` of that file would also stage the unstaged changes and put them in the commit. The file is committed as staged, and the amend hint of the formatters stays as the fallback for it.

## Limits

- One formatter run for each file and formatter. A Node start costs about 20 ms, and Prettier about 0.4 s for each run, so a commit of 30 files adds about 13 s.
- Config-based hooks need a recent git. An older git ignores the `hook.*` entries and shows no error. The test fails its first check on such a git.
- The linters do not run here. `lint-code` and `lint-prose` check whole files, so a linter at `pre-commit` would stop commits because of problems that were in the file before.

## Test

```sh
node test/check.ts
```

[`test/check.ts`](test/check.ts) makes real commits in a temporary repository under `$HOME`, because the formatters skip `/tmp`. It reads the hook command from `dot_config/git/config` and sets it through `GIT_CONFIG_*` variables, so it does not depend on `~/.config/git/config`. `HOME` is a temporary folder that links to the hook folders of this repository, so the test runs this source and not the deployed copy.

It checks a staged new file, `commit -a`, a partly staged file, an Org table, a Terraform file, a file no formatter handles, a symlink, each agent variable, a commit outside an agent, and a commit with no `node` on `PATH`. It needs git and Prettier. The Org case also needs Emacs, and the Terraform case needs terraform. The test skips each case when its program is not installed.
