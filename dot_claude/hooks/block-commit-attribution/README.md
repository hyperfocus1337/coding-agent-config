# block-commit-attribution

Blocks a `git commit` whose message has a `Co-Authored-By:` trailer, for any co-author. The model then removes the trailer and runs the commit again.

One matcher, [`core.ts`](core.ts), serves three agents through two adapters:

| Agent       | Adapter                                                                                 | Loaded by                                                                                          |
| ----------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Bash returns `{ deny }` | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `tool_call` on bash returns `{ block, reason }`                       | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |

Codex does not run this hook. See [`docs/hooks/decisions.md`](../../../docs/hooks/decisions.md#the-move-added-no-hook-to-codex).

## Why a hook

`attribution.commit: ""` in `settings.json` stops Claude Code from adding the trailer. It does not stop the model from writing the trailer itself, out of habit. A `permissions.deny` rule such as `Bash(git commit *Co-Authored-By: Claude*)` blocks the `-m` form, but a test on Claude Code 2.1.291 showed that it does not match the trailer in a heredoc body (`git commit -F - <<'EOF'`), which is the form the model uses most.

## How it works

The hook blocks a Bash call when both of these are true, case-insensitive:

- `commit` is a whole word in the command. A letter, a digit, `_`, or `-` next to it makes a different word, so `git log --grep 'Co-Authored-By: Claude'`, `rg ... committed.txt`, and `git commit-tree` pass.
- The command holds `co-authored-by:`. The hook does not read the name after it, so it blocks every agent, also one that does not exist yet, with no list to keep current.

A human co-author is blocked too. In an agent's commit, a human trailer occurs only when you ask for one, or when the agent rewrites a message that already has one. In those cases, commit by hand.

The check reads the whole command, so the hook also blocks a command that commits and only mentions the trailer, for example a `git commit` and a `cat` of a file that holds the trailer, joined with `&&`. To run such a command, split it into two calls.

One gap remains: a message written to a file in an earlier call and passed with `git commit -F <file>` passes. A git `commit-msg` hook is the upgrade path.

## Failure behavior

The hook fails open in Claude Code: Claude Code skips a mod hook that throws, and the call runs. `pi.ts` does no I/O and catches nothing. If it throws on a malformed event, pi blocks that call.

`claude-nohooks` and the other launch modes that set `disableAllHooks` also turn off this mod (tested on 2026-10-19).

## Dependencies

The mod needs Claude Code 2.1.296 or later, the oldest version tested. `pi.ts` needs Node 23.6 or later, which runs `.ts` files without a flag.

## Tests

`node test/check.ts`, from the hook folder, checks the matcher and both adapters: the mod with a stub `on`, and `pi.ts` with a stub `pi`. It prints one `FAIL` line for each failed case, then `all pass` or the failure count. `just hooks-check` runs it with the checks of the other hooks.

## Files

| File                                    | Deployed to `~/.claude/hooks/block-commit-attribution/` | Role                                 |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| `core.ts`                               | Yes                                                     | Matcher and block message. No I/O.   |
| `hooks/register.ts`, `hooks/hooks.json` | Yes                                                     | Claude Code mod                      |
| `dot_claude-plugin/plugin.json`         | Yes, as `.claude-plugin/plugin.json`                    | Plugin manifest                      |
| `pi.ts`                                 | Yes                                                     | pi and omp extension                 |
| `README.md`, `test/`                    | No                                                      | Kept in the repo by `.chezmoiignore` |
