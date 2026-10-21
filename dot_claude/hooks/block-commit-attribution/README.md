# block-commit-attribution

Blocks a `git commit` whose message has a `Co-Authored-By:` trailer, for any co-author. The model then removes the trailer and runs the commit again, because you do not want attribution lines in commits.

One matcher, [`core.ts`](core.ts), serves three agents through two adapters. An adapter is the small file that connects the matcher to the hook API of one agent.

| Agent       | Adapter                                                                                 | Loaded by                                                                                          |
| ----------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Bash returns `{ deny }` | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `tool_call` on bash returns `{ block, reason }`                       | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |

Codex does not run this hook. See [`docs/hooks/decisions.md`](../../../docs/hooks/decisions.md#the-move-added-no-hook-to-codex).

## What it checks

The hook runs before each shell call: Bash in Claude Code, bash in pi and omp. It blocks the call when both of these are true, case-insensitive:

- `commit` is a whole word in the command. A letter, a digit, `_`, or `-` next to it makes a different word, so `git log --grep 'Co-Authored-By: Claude'`, `rg ... committed.txt`, and `git commit-tree` pass.
- The command holds `co-authored-by:`. The hook does not read the name after it, so it blocks every agent, also one that does not exist yet, with no list to keep current.

The hook also blocks a human co-author. In an agent's commit, a human trailer occurs only when you ask for one, or when the agent rewrites a message that already has one. In those cases, commit by hand.

## Requirements

- **Claude Code:** the mod needs Claude Code 2.1.296 or later, the oldest version tested.
- **pi and omp:** they load `pi.ts` in their own runtime, so the hook needs no `node` on `PATH`.

## How it works

1. The adapter reads the command of the shell call. In pi and omp, `pi.ts` ignores other tools and a command that is not a string.
2. `violation()` in `core.ts` tests the command for the two conditions in [What it checks](#what-it-checks).
3. If both are true, the adapter blocks the call with the block message. Else the call runs.

The check reads the whole command, so the hook also blocks a command that commits and only mentions the trailer. An example is a `git commit` and a `cat` of a file that holds the trailer, joined with `&&`. To run such a command, split it into two calls.

One gap remains: a message written to a file in an earlier call and passed with `git commit -F <file>` passes. A git `commit-msg` hook is the upgrade path.

## What the model sees

When the hook blocks a call, the command does not run. The model gets this block message as the reason:

```text
Blocked: remove the Co-Authored-By trailer from the commit message and run the commit again. The user does not want attribution lines in commits.
```

The hook runs in the agent process, so it has no exit code. A call that passes gives the model no output.

## Settings

The hook has no variables or config files. `AGENT_HOOKS_DISABLE` does not turn it off, because it is a guard, not an advisory hook. See [`toggle-hook`](../toggle-hook/README.md).

To turn the hook off:

- **Claude Code:** start with `claude-nohooks` or another launch mode that sets `disableAllHooks`. These also turn off this mod (tested on 2026-10-19). See [`launch-modes.md`](../../docs/launch-modes.md).
- **pi and omp:** remove the `pi.ts` line of this hook from `extensions` in the agent's settings.

## Failure behavior

- **Claude Code:** the hook fails open. Claude Code skips a mod hook that throws, and the call runs.
- **pi and omp:** `pi.ts` does no I/O and catches nothing. If it throws on a malformed event, pi blocks that call, so the hook fails closed.

## Testing

`node test/check.ts` checks the matcher and both adapters. See [`docs/testing.md`](docs/testing.md).

## Design notes

### Why a hook

`attribution.commit: ""` in `settings.json` stops Claude Code from adding the trailer. It does not stop the model from writing the trailer itself, out of habit.

A `permissions.deny` rule such as `Bash(git commit *Co-Authored-By: Claude*)` blocks the `-m` form. A test on Claude Code 2.1.291 showed that it does not match the trailer in a heredoc body (`git commit -F - <<'EOF'`). The model uses that form most.

### Files

| File                                    | Deployed to `~/.claude/hooks/block-commit-attribution/` | Role                                 |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| `core.ts`                               | Yes                                                     | Matcher and block message. No I/O.   |
| `hooks/register.ts`, `hooks/hooks.json` | Yes                                                     | Claude Code mod                      |
| `dot_claude-plugin/plugin.json`         | Yes, as `.claude-plugin/plugin.json`                    | Plugin manifest                      |
| `pi.ts`                                 | Yes                                                     | pi and omp extension                 |
| `README.md`, `docs/`, `test/`           | No                                                      | Kept in the repo by `.chezmoiignore` |
