# block-commit-attribution

A git `commit-msg` hook that blocks a commit made in an agent session when its message has a `Co-Authored-By:` trailer, for any co-author. The model then removes the trailer and runs the commit again, because you do not want attribution lines in commits.

It is a git hook, not an agent hook: it has no adapters, and it covers Claude Code, pi, omp, and Codex with one script, [`main.ts`](main.ts).

## What it checks

Git starts the hook on each `git commit`, in each repository, with the path of the message file. The hook checks only when the commit runs in an agent session. It uses the same variables as [`format-staged-files`](../format-staged-files/README.md#what-it-checks): `CLAUDECODE=1`, `PI_CODING_AGENT=true`, `OMPCODE=1`, or `CODEX_THREAD_ID`.

The hook blocks when a line of the message starts with `co-authored-by:`, case-insensitive. It does not read the name after it, so it blocks every agent, also one that does not exist yet, with no list to keep current.

Git writes the message to one file for each form: `-m`, a second `-m`, `-F <file>`, a heredoc on `-F -`, and the editor. So the hook checks all of them. These pass:

- The trailer text inside a line, for example in a sentence of the body.
- A `#` comment line, and the diff that `git commit -v` adds below the scissors line.
- `git log --grep`, `git commit-tree`, and every other command that does not run the `commit-msg` hook.

The hook also blocks a human co-author in an agent session. In an agent's commit, a human trailer occurs only when you ask for one, or when the agent rewrites a message that already has one. In those cases, commit by hand. A commit that you make yourself does not get the hook.

## Requirements

- **git** with config-based hooks: `hook.<name>.command` and `hook.<name>.event`. An older git ignores the `hook.*` entries and shows no error.
- **Node 23.6 or later** on the `PATH` of git, which runs a `.ts` file. Without it, each commit blocks, see [Failure behavior](#failure-behavior).

## How it works

[`dot_config/git/config`](../../config) sets the hook in `~/.config/git/config`:

```ini
[hook "block-commit-attribution"]
	event = commit-msg
	command = "command -v node >/dev/null || { echo '...' >&2; exit 1; }; NODE_COMPILE_CACHE=\"$HOME/.cache/node-compile-cache\" node \"$HOME/.config/git/hooks/block-commit-attribution/main.ts\""
```

Git adds the path of the message file after the command, so `node` must be the last command.

1. `main.ts` exits 0 at once when no agent variable is set.
2. It reads the message file and tests each line for the trailer.
3. If a line has it, the hook writes the block message to stderr and exits 1. Git then stops the commit.

## What the model sees

The model sees the output of `git commit` in the Bash result. When the hook blocks, the commit does not occur and the output holds this line:

```text
Blocked: remove the Co-Authored-By trailer from the commit message and run the commit again. The user does not want attribution lines in commits.
```

A commit that passes gives no output from this hook.

## Settings

The hook has no variables or config files. `AGENT_HOOKS_DISABLE` does not turn it off, because it is a guard, not an advisory hook. See [`toggle-hook`](../../../../dot_claude/hooks/toggle-hook/README.md).

- **One commit:** run the commit in your own terminal, outside an agent.
- **One repository:** run `git config hook.block-commit-attribution.enabled false` in the repository.

An agent cannot skip the hook with `git commit --no-verify` or `-n`: the [`local.git_hooks`](../../../dcg/README.md#custom-packs) pack of dcg blocks that command.

## Failure behavior

The hook fails closed: when it cannot check the message, the commit blocks.

- **No `node` on the `PATH` of git:** the command prints a block message that names the problem and exits 1. This also occurs for your own commits, before `main.ts` can see that no agent variable is set.
- **A `node` older than 23.6, or an error in `main.ts`:** `node` exits with an error and its error text, and git stops the commit.
- **An older git:** git ignores the `hook.*` entries, so the hook does not run.

## Testing

[`test/check.ts`](test/check.ts) makes real commits in a temporary repository, see [testing](docs/testing.md).

## Design notes

### Why a git hook

Before, the hook was an agent hook that read the shell command before it ran. It had these gaps, which a `commit-msg` hook does not have:

- A message written to a file in an earlier call and passed with `git commit -F <file>` passed.
- The check read the whole command, so it also blocked a command that committed and only mentioned the trailer, for example in a `cat` joined with `&&`.
- Codex did not run it, and Claude Code, pi, and omp each needed an adapter.

`attribution.commit: ""` in `settings.json` stops Claude Code from adding the trailer. It does not stop the model from writing the trailer itself, out of habit.

### Files

| File                          | Deployed to `~/.config/git/hooks/block-commit-attribution/` | Role                                 |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| `main.ts`                     | Yes                                                         | The hook                             |
| `README.md`, `docs/`, `test/` | No                                                          | Kept in the repo by `.chezmoiignore` |
