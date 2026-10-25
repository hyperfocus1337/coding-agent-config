# Testing format-staged-files

Run the check from the hook folder:

```sh
node test/check.ts
```

`just hooks-check` also runs it. The check prints `all pass`, or one `FAIL` line for each failed case and exits 1.

## Setup

[`test/check.ts`](../test/check.ts) makes real commits in a temporary repository under `$HOME`, because the formatters skip `/tmp` and `$TMPDIR`.

- **The hook commands:** the check reads the `pre-commit` and `post-commit` commands from `dot_config/git/config` and sets them through `GIT_CONFIG_*` variables, so it does not depend on `~/.config/git/config`.
- **`HOME`:** a temporary folder that links to the hook folders of this repository, so the check runs this source and not the deployed copy.
- **Agent variables:** the check removes them from the environment of the session that runs it. Each commit sets the variable that the case needs, by default `CLAUDECODE=1`.
- **`PATH`:** the check removes the mise shim folder. A mise shim reads its config under the real `HOME`, and under the temporary `HOME` it fails before it falls back to the real program.

## Cases

- **Formatting:** a staged new file, `git commit -a`, `git commit <path>`, two files in one commit, an Org table, a Terraform file, and a file that no formatter handles.
- **`git commit <path>`:** the tree and the index are clean after the commit, and the `post-commit` run deletes its record file.
- **Literal paths:** a commit of `[c].md` does not stage an untracked `c.md`.
- **Output:** one stderr line for each file that the hook staged again, and no line for an unchanged file.
- **Skipped files:** a partly staged file is committed as staged, and its unstaged change stays in the tree. A symlink stays a symlink.
- **Agent detection:** each agent variable turns the hook on, and a commit outside an agent is not formatted.
- **`AGENT_HOOKS_DISABLE`:** a commit is still formatted when the variable names `format-oxfmt`.
- **Repository key:** a commit is not formatted when `agent-hook.format-oxfmt.enabled` is `false` in the repository.
- **Other types:** oxfmt formats a staged `.toml` file.
- **No `node`:** a commit with no `node` on `PATH` continues, with no output.

## Requirements

The check needs git and oxfmt on `PATH`. It removes the mise shims from `PATH`, because a shim fails under the fixture `HOME`, so oxfmt must also be on `PATH` outside the shims. Without one of them, the check prints `SKIP` and exits 0. The Org case also needs Emacs, and the Terraform case needs terraform. The check skips each of these cases when its program is not installed.

On a git without config-based hooks, the hook does not run, so the first case fails.
